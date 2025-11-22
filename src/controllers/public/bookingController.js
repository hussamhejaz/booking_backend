// src/controllers/public/bookingController.js
const { supabaseAdmin } = require("../../supabase");

function ensure(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

function timeToMinutes(val) {
  if (!val) return 0;
  const [h = "0", m = "0"] = val.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function minutesToTimeString(minutes) {
  const hrs = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor(minutes % 60)
    .toString()
    .padStart(2, "0");
  return `${hrs}:${mins}`;
}

function slotsFromWorkingDay(dayConfig, existingBookings, durationMinutes) {
  if (!dayConfig || dayConfig.is_closed || !dayConfig.open_time || !dayConfig.close_time) {
    return [];
  }

  const open = timeToMinutes(dayConfig.open_time);
  const close = timeToMinutes(dayConfig.close_time);
  const breakStart = dayConfig.break_start ? timeToMinutes(dayConfig.break_start) : null;
  const breakEnd = dayConfig.break_end ? timeToMinutes(dayConfig.break_end) : null;
  const slotInterval = dayConfig.slot_interval ? parseInt(dayConfig.slot_interval, 10) : 30;
  const duration = durationMinutes || 30;

  const busyWindows = (existingBookings || []).map((booking) => {
    const start = timeToMinutes(booking.booking_time);
    const end = start + (booking.duration_minutes || duration);
    return { start, end };
  });

  const slots = [];
  for (let start = open; start + duration <= close; start += slotInterval) {
    const end = start + duration;

    if (breakStart !== null && breakEnd !== null) {
      const overlapsBreak = Math.max(start, breakStart) < Math.min(end, breakEnd);
      if (overlapsBreak) {
        continue;
      }
    }

    const overlapsBooking = busyWindows.some(
      ({ start: busyStart, end: busyEnd }) => Math.max(start, busyStart) < Math.min(end, busyEnd)
    );

    if (!overlapsBooking) {
      slots.push(minutesToTimeString(start));
    }
  }

  return slots;
}

async function createPublicBooking(req, res) {
  try {
    const { salonId } = req.params;
    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    ensure(req.body, "customer_name");
    ensure(req.body, "customer_phone");
    ensure(req.body, "booking_date");
    ensure(req.body, "booking_time");
    ensure(req.body, "service_id");

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_notes,
      service_id,
      duration_minutes,
      total_price,
    } = req.body;
    const booking_date = req.body.booking_date;
    const booking_time = req.body.booking_time;

    // Ensure salon exists and active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    const { data: service, error: serviceError } = await supabaseAdmin
      .from("services")
      .select("id, salon_id, duration_minutes, price, is_active")
      .eq("id", service_id)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({
        ok: false,
        error: "SERVICE_NOT_FOUND",
      });
    }

    const actualDuration = duration_minutes || service.duration_minutes || 30;

    // Validate working hours for date/time
    const { data: workingHours, error: hoursError } = await supabaseAdmin
      .from("working_hours")
      .select("*")
      .eq("salon_id", salonId);

    if (hoursError) {
      console.error("createPublicBooking workingHours error:", hoursError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_WORKING_HOURS_FAILED",
      });
    }

    const bookingDay = new Date(`${booking_date}T00:00:00Z`).getUTCDay();
    const dayConfig = (workingHours || []).find((day) => day.day_of_week === bookingDay);

    if (!dayConfig || dayConfig.is_closed) {
      return res.status(400).json({
        ok: false,
        error: "SALON_CLOSED",
        details: "Selected day is not available for bookings",
      });
    }

    const requestedStart = timeToMinutes(booking_time);
    const requestedEnd = requestedStart + actualDuration;
    const openMinutes = timeToMinutes(dayConfig.open_time);
    const closeMinutes = timeToMinutes(dayConfig.close_time);

    if (requestedStart < openMinutes || requestedEnd > closeMinutes) {
      return res.status(400).json({
        ok: false,
        error: "OUTSIDE_WORKING_HOURS",
      });
    }

    if (dayConfig.break_start && dayConfig.break_end) {
      const breakStart = timeToMinutes(dayConfig.break_start);
      const breakEnd = timeToMinutes(dayConfig.break_end);
      const overlapsBreak = Math.max(requestedStart, breakStart) < Math.min(requestedEnd, breakEnd);
      if (overlapsBreak) {
        return res.status(400).json({
          ok: false,
          error: "BOOKING_DURING_BREAK",
        });
      }
    }

    // Check conflicts with existing bookings
    const { data: overlapping, error: overlapError } = await supabaseAdmin
      .from("bookings")
      .select("id, booking_time, duration_minutes")
      .eq("salon_id", salonId)
      .eq("booking_date", booking_date)
      .in("status", ["confirmed", "pending"]);

    if (overlapError) {
      console.error("createPublicBooking overlap error:", overlapError);
    } else if (overlapping?.length) {
      const hasConflict = overlapping.some((booking) => {
        const start = timeToMinutes(booking.booking_time);
        const end = start + (booking.duration_minutes || actualDuration);
        return Math.max(requestedStart, start) < Math.min(requestedEnd, end);
      });

      if (hasConflict) {
        return res.status(409).json({
          ok: false,
          error: "BOOKING_CONFLICT",
          details: "Selected time slot is no longer available, please choose a different slot.",
        });
      }
    }

    const payload = {
      salon_id: salonId,
      service_id,
      customer_name: customer_name.trim(),
      customer_email: customer_email?.trim() || null,
      customer_phone: customer_phone.trim(),
      customer_notes: customer_notes?.trim() || null,
      booking_date,
      booking_time,
      duration_minutes: actualDuration,
      total_price: total_price || service.price,
      status: "pending",
      source: "public",
    };

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert([payload])
      .select(
        `
        *,
        services:service_id (id, name, price, duration_minutes)
      `
      )
      .single();

    if (error) {
      console.error("createPublicBooking insert error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_BOOKING_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      booking,
      message: "Booking request received, we will confirm shortly.",
    });
  } catch (err) {
    console.error("createPublicBooking fatal:", err);
    const status = err.message?.startsWith("Missing field") ? 400 : 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
    });
  }
}

async function getPublicAvailability(req, res) {
  try {
    const { salonId } = req.params;
    const { date, duration_minutes } = req.query;

    if (!salonId || !date) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_PARAMETERS",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    const { data: workingHours, error: hoursError } = await supabaseAdmin
      .from("working_hours")
      .select("*")
      .eq("salon_id", salonId);

    if (hoursError) {
      console.error("getPublicAvailability workingHours error:", hoursError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_WORKING_HOURS_FAILED",
      });
    }

    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayConfig = (workingHours || []).find((day) => day.day_of_week === dayOfWeek);

    if (!dayConfig || dayConfig.is_closed) {
      return res.json({
        ok: true,
        date,
        available_slots: [],
        working_day: dayConfig || null,
      });
    }

    const { data: existingBookings, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("booking_time, duration_minutes")
      .eq("salon_id", salonId)
      .eq("booking_date", date)
      .in("status", ["confirmed", "pending"]);

    if (bookingError) {
      console.error("getPublicAvailability bookings error:", bookingError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_BOOKINGS_FAILED",
      });
    }

    const slots = slotsFromWorkingDay(
      dayConfig,
      existingBookings || [],
      duration_minutes ? parseInt(duration_minutes, 10) : undefined
    );

    return res.json({
      ok: true,
      date,
      available_slots: slots,
      working_day: dayConfig,
    });
  } catch (err) {
    console.error("getPublicAvailability fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  createPublicBooking,
  getPublicAvailability,
};
