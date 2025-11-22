// src/controllers/owner/availabilityController.js
const { supabaseAdmin } = require("../../supabase");

function timeToMinutes(value) {
  if (!value) return 0;
  const [hours = "0", minutes = "0"] = value.split(":");
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(minutes % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

function parseDayConfig(dayConfig) {
  return {
    open: timeToMinutes(dayConfig.open_time),
    close: timeToMinutes(dayConfig.close_time),
    breakStart: dayConfig.break_start ? timeToMinutes(dayConfig.break_start) : null,
    breakEnd: dayConfig.break_end ? timeToMinutes(dayConfig.break_end) : null,
    slotInterval: dayConfig.slot_interval ? parseInt(dayConfig.slot_interval, 10) : 30,
  };
}

function buildBusyWindows(existingBookings, fallbackDuration) {
  return (existingBookings || []).map((booking) => {
    const start = timeToMinutes(booking.booking_time);
    const end = start + (booking.duration_minutes || fallbackDuration);
    return { start, end };
  });
}

function slotOverlapsBreak(boundaries, start, end) {
  const { breakStart, breakEnd } = boundaries;
  if (breakStart === null || breakEnd === null) {
    return false;
  }
  return Math.max(start, breakStart) < Math.min(end, breakEnd);
}

function slotWithinBounds(boundaries, start, end) {
  return start >= boundaries.open && end <= boundaries.close;
}

function slotOverlapsBookings(busyWindows, start, end) {
  return busyWindows.some(
    ({ start: busyStart, end: busyEnd }) =>
      Math.max(start, busyStart) < Math.min(end, busyEnd)
  );
}

function slotsFromConfig(dayConfig, busyWindows, duration) {
  if (!dayConfig || dayConfig.is_closed || !dayConfig.open_time || !dayConfig.close_time) {
    return [];
  }

  const boundaries = parseDayConfig(dayConfig);
  const slots = [];

  for (let start = boundaries.open; start + duration <= boundaries.close; start += boundaries.slotInterval) {
    const end = start + duration;

    if (slotOverlapsBreak(boundaries, start, end)) {
      continue;
    }

    if (slotOverlapsBookings(busyWindows, start, end)) {
      continue;
    }

    slots.push(minutesToTime(start));
  }

  return slots;
}

function slotsFromManualSlots(dayConfig, manualSlots, busyWindows, defaultDuration) {
  if (!dayConfig || dayConfig.is_closed || !dayConfig.open_time || !dayConfig.close_time) {
    return [];
  }

  const boundaries = parseDayConfig(dayConfig);
  const slots = [];

  manualSlots.forEach((slot) => {
    const duration = slot.duration_minutes || defaultDuration;
    const start = timeToMinutes(slot.slot_time);
    const end = start + duration;

    if (!slotWithinBounds(boundaries, start, end)) {
      return;
    }

    if (slotOverlapsBreak(boundaries, start, end)) {
      return;
    }

    if (slotOverlapsBookings(busyWindows, start, end)) {
      return;
    }

    slots.push(minutesToTime(start));
  });

  return slots;
}

async function fetchServiceDuration(supabaseClient, salonId, serviceId, type) {
  if (!serviceId) {
    return null;
  }

  const table = type === "home" ? "home_services" : "services";
  const { data, error } = await supabaseClient
    .from(table)
    .select("id, duration_minutes, price, is_active")
    .eq("id", serviceId)
    .eq("salon_id", salonId)
    .single();

  if (error || !data || data.is_active === false) {
    return { error: "SERVICE_NOT_FOUND" };
  }

  return { duration: data.duration_minutes || 30 };
}

async function getOwnerAvailableSlots(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const {
      date,
      service_id,
      home_service_id,
      duration_minutes,
      type,
    } = req.query;

    if (!salonId) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    if (!date) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_DATE",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const bookingType =
      type ||
      (home_service_id ? "home" : "salon");

    let resolvedDuration = duration_minutes ? parseInt(duration_minutes, 10) : null;

    if (!resolvedDuration) {
      const serviceId = bookingType === "home" ? home_service_id : service_id;
      if (serviceId) {
        const { duration, error } = await fetchServiceDuration(
          supabaseAdmin,
          salonId,
          serviceId,
          bookingType
        );
        if (error) {
          return res.status(404).json({
            ok: false,
            error,
          });
        }
        resolvedDuration = duration || 30;
      } else if (home_service_id || service_id) {
        // service was provided but not found
        return res.status(404).json({
          ok: false,
          error: "SERVICE_NOT_FOUND",
        });
      } else {
        resolvedDuration = 30;
      }
    }

    // Ensure salon exists and is active
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
      console.error("getOwnerAvailableSlots working hours error:", hoursError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_WORKING_HOURS_FAILED",
      });
    }

    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const dayConfig = (workingHours || []).find(
      (day) => day.day_of_week === dayOfWeek
    );

    if (!dayConfig || dayConfig.is_closed) {
      return res.json({
        ok: true,
        date,
        available_slots: [],
        details: "Salon is closed on this day",
      });
    }

    let existingBookingsQuery;
    if (bookingType === "home") {
      existingBookingsQuery = supabaseAdmin
        .from("home_service_bookings")
        .select("booking_time, duration_minutes")
        .eq("salon_id", salonId)
        .eq("booking_date", date)
        .in("status", ["confirmed", "pending"]);
    } else {
      existingBookingsQuery = supabaseAdmin
        .from("bookings")
        .select("booking_time, duration_minutes")
        .eq("salon_id", salonId)
        .eq("booking_date", date)
        .in("status", ["confirmed", "pending"]);
    }

    const { data: existingBookings, error: bookingError } = await existingBookingsQuery;

    if (bookingError) {
      console.error("getOwnerAvailableSlots booking lookup error:", bookingError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_BOOKINGS_FAILED",
      });
    }

    let specificSlots = [];
    let specificSlotsError = null;
    let specificSlotSource = null;

    if (bookingType === "home" && home_service_id) {
      const { data, error } = await supabaseAdmin
        .from("home_service_time_slots")
        .select("slot_time, duration_minutes")
        .eq("home_service_id", home_service_id)
        .eq("is_active", true)
        .order("slot_time", { ascending: true });
      if (error) {
        console.error("getOwnerAvailableSlots home service slots error:", error);
        specificSlotsError = error;
      } else {
        specificSlots = data || [];
        specificSlotSource = "home_service";
      }
    } else if (bookingType === "salon" && service_id) {
      const { data, error } = await supabaseAdmin
        .from("service_time_slots")
        .select("slot_time, duration_minutes")
        .eq("service_id", service_id)
        .eq("is_active", true)
        .order("slot_time", { ascending: true });
      if (error) {
        console.error("getOwnerAvailableSlots service slots error:", error);
        specificSlotsError = error;
      } else {
        specificSlots = data || [];
        specificSlotSource = "service";
      }
    }

    const { data: manualSlots, error: manualSlotsError } = await supabaseAdmin
      .from("salon_time_slots")
      .select("slot_time, duration_minutes")
      .eq("salon_id", salonId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true)
      .order("slot_time", { ascending: true });

    if (manualSlotsError) {
      console.error("getOwnerAvailableSlots manual slots error:", manualSlotsError);
    }

    const busyWindows = buildBusyWindows(existingBookings, resolvedDuration);

    let availableSlots = [];
    let slotStrategy = "working_hours";

    if (!specificSlotsError && specificSlots?.length) {
      const specificAvailable = slotsFromManualSlots(
        dayConfig,
        specificSlots,
        busyWindows,
        resolvedDuration
      );

      if (specificAvailable.length) {
        availableSlots = specificAvailable;
        slotStrategy = specificSlotSource || "service";
      }
    }

    if (!availableSlots.length && !manualSlotsError && manualSlots?.length) {
      const manualAvailable = slotsFromManualSlots(
        dayConfig,
        manualSlots,
        busyWindows,
        resolvedDuration
      );

      if (manualAvailable.length) {
        availableSlots = manualAvailable;
        slotStrategy = "manual";
      }
    }

    if (!availableSlots.length) {
      availableSlots = slotsFromConfig(dayConfig, busyWindows, resolvedDuration);
      slotStrategy = "working_hours";
    }

    return res.json({
      ok: true,
      date,
      duration_minutes: resolvedDuration,
      type: bookingType,
      available_slots: availableSlots,
      working_hours: {
        open_time: dayConfig.open_time,
        close_time: dayConfig.close_time,
        break_start: dayConfig.break_start,
        break_end: dayConfig.break_end,
        slot_interval: dayConfig.slot_interval || 30,
      },
      slot_strategy: slotStrategy,
      service_slots_defined: bookingType === "salon" ? (specificSlots?.length || 0) : 0,
      home_service_slots_defined: bookingType === "home" ? (specificSlots?.length || 0) : 0,
      manual_slots_defined: manualSlots?.length || 0,
    });
  } catch (err) {
    console.error("getOwnerAvailableSlots fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message,
    });
  }
}

module.exports = {
  getOwnerAvailableSlots,
};
