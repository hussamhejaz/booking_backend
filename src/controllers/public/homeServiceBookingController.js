// controllers/public/homeServiceBookingController.js
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

function timeToMinutes(time) {
  if (!time) return 0;
  const [hours = "0", minutes = "0"] = String(time).split(":");
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

async function listPublicHomeServiceSlots(req, res) {
  try {
    const { salonId } = req.params;
    const { home_service_id } = req.query;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    if (!home_service_id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_HOME_SERVICE_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: homeService, error: homeServiceError } = await supabaseAdmin
      .from("home_services")
      .select("id, salon_id, is_active")
      .eq("id", home_service_id)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .single();

    if (homeServiceError || !homeService) {
      return res.status(404).json({
        ok: false,
        error: "HOME_SERVICE_NOT_FOUND",
        details: homeServiceError?.message,
      });
    }

    const { data: slots, error: slotsError } = await supabaseAdmin
      .from("home_service_time_slots")
      .select("id, slot_time, duration_minutes, is_active")
      .eq("home_service_id", home_service_id)
      .eq("is_active", true)
      .order("slot_time", { ascending: true });

    if (slotsError) {
      console.error("listPublicHomeServiceSlots error:", slotsError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_HOME_SERVICE_SLOTS_FAILED",
        details: slotsError.message,
      });
    }

    return res.json({
      ok: true,
      slots: slots || [],
    });
  } catch (err) {
    console.error("listPublicHomeServiceSlots fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

/**
 * يتحقق من وجود تعارض مع حجوزات أخرى لنفس الخدمة المنزلية في نفس الصالون
 */
async function checkHomeServiceBookingConflict(
  salonId,
  date,
  time,
  duration,
  homeServiceId,
  excludeBookingId = null
) {
  if (!supabaseAdmin) {
    return { hasConflict: false };
  }

  const requestedStart = timeToMinutes(time);
  const requestedEnd = requestedStart + duration;

  let query = supabaseAdmin
    .from("home_service_bookings")
    .select(
      "id, home_service_id, customer_name, booking_time, duration_minutes, status"
    )
    .eq("salon_id", salonId)
    .eq("booking_date", date)
    .in("status", ["confirmed", "pending"]);

  if (excludeBookingId) {
    query = query.neq("id", excludeBookingId);
  }

  // ✅ تعارض فقط مع نفس الخدمة المنزلية
  if (homeServiceId) {
    query = query.eq("home_service_id", homeServiceId);
  }

  const { data: bookings, error } = await query;

  if (error) {
    console.error("checkHomeServiceBookingConflict error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    // لا نمنع الحجز بسبب خطأ في القراءة
    return { hasConflict: false };
  }

  const conflicts = (bookings || []).filter((booking) => {
    const existingStart = timeToMinutes(booking.booking_time);
    const existingDuration = booking.duration_minutes || duration;
    const existingEnd = existingStart + existingDuration;

    // تداخل الفترتين
    return (
      Math.max(requestedStart, existingStart) <
      Math.min(requestedEnd, existingEnd)
    );
  });

  if (conflicts.length) {
    return {
      hasConflict: true,
      message: "Selected slot overlaps with another booking",
      conflictingBookings: conflicts,
    };
  }

  return { hasConflict: false };
}

async function createPublicHomeServiceBooking(req, res) {
  try {
    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    // لو الفرونت أرسل home_address استخدمه كـ customer_address
    if (!req.body.customer_address && req.body.home_address) {
      req.body.customer_address = req.body.home_address;
    }

    // الحقول الإلزامية
    ensure(req.body, "customer_name");
    ensure(req.body, "customer_phone");
    ensure(req.body, "customer_area");
    ensure(req.body, "customer_address");
    ensure(req.body, "booking_date");
    ensure(req.body, "booking_time");
    ensure(req.body, "home_service_id");

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
      customer_area,
      customer_address,
      customer_notes,
      booking_date,
      booking_time,
      home_service_id,
      duration_minutes,
      total_price,
      travel_fee,
      special_requirements,
      home_building,
      home_floor,
    } = req.body;

    const locationNotes = [home_building, home_floor]
      .map((value) => (typeof value === "string" ? value.trim() : value))
      .filter(Boolean);

    const combinedSpecialRequirements = [
      typeof special_requirements === "string"
        ? special_requirements.trim()
        : null,
      ...locationNotes,
    ]
      .filter(Boolean)
      .join(" | ");

    // تأكد الصالون موجود و Active
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
        details: salonError?.message,
      });
    }

    // تأكد الخدمة المنزلية موجودة و Active
    const { data: homeService, error: homeServiceError } = await supabaseAdmin
      .from("home_services")
      .select("id, name, price, duration_minutes, category, is_active")
      .eq("id", home_service_id)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .single();

    if (homeServiceError || !homeService) {
      return res.status(404).json({
        ok: false,
        error: "HOME_SERVICE_NOT_FOUND",
        details: homeServiceError?.message,
      });
    }

    // مدة الجلسة
    const parsedDuration = duration_minutes
      ? parseInt(duration_minutes, 10)
      : homeService.duration_minutes;

    const finalDuration =
      Number.isFinite(parsedDuration) && parsedDuration > 0
        ? parsedDuration
        : homeService.duration_minutes || 30;

    // لو الوقت جاي "HH:MM" خليه "HH:MM:00" عشان نوع time في قاعدة البيانات
    const normalizedTime =
      typeof booking_time === "string" && booking_time.length === 5
        ? `${booking_time}:00`
        : booking_time;

    // ✅ تحقق من التعارض لنفس الخدمة المنزلية فقط
    const conflictCheck = await checkHomeServiceBookingConflict(
      salonId,
      booking_date,
      normalizedTime,
      finalDuration,
      home_service_id
    );

    if (conflictCheck.hasConflict) {
      return res.status(409).json({
        ok: false,
        error: "BOOKING_CONFLICT",
        message: "الوقت المختار غير متاح، الرجاء اختيار وقت آخر.",
        details: conflictCheck.message,
        conflictingBookings: conflictCheck.conflictingBookings,
      });
    }

    // الأسعار
    let finalServicePrice = parseFloat(total_price);
    if (Number.isNaN(finalServicePrice)) {
      finalServicePrice = homeService.price || 0;
    }

    let finalTravelFee = parseFloat(travel_fee);
    if (Number.isNaN(finalTravelFee)) {
      finalTravelFee = 0;
    }

    const insertPayload = {
      salon_id: salonId,
      home_service_id,
      customer_name: customer_name.trim(),
      customer_email: customer_email?.trim() || null,
      customer_phone: customer_phone.trim(),
      customer_area: customer_area.trim(),
      customer_address: customer_address.trim(),
      customer_notes: customer_notes?.trim() || null,
      booking_date,
      booking_time: normalizedTime,
      duration_minutes: finalDuration,
      service_price: finalServicePrice,
      travel_fee: finalTravelFee,
      total_price: finalServicePrice + finalTravelFee,
      status: "pending",
      special_requirements: combinedSpecialRequirements || null,
    };

    const { data: booking, error } = await supabaseAdmin
      .from("home_service_bookings")
      .insert([insertPayload])
      .select(
        `
        *,
        home_services:home_service_id (id, name, price, duration_minutes, category)
      `
      )
      .single();

    if (error) {
      console.error("createPublicHomeServiceBooking error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        insertPayload,
      });

      return res.status(500).json({
        ok: false,
        error: "CREATE_BOOKING_FAILED",
        details: error.message,
      });
    }

    // ⚠️ notifications: جدولك محذوف، فخليه اختياري
    return res.status(201).json({
      ok: true,
      booking,
      message:
        "Home service booking request received, we will confirm shortly.",
    });
  } catch (err) {
    console.error("createPublicHomeServiceBooking fatal:", err);
    const status = err.message?.startsWith("Missing field") ? 400 : 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
    });
  }
}

module.exports = {
  createPublicHomeServiceBooking,
  listPublicHomeServiceSlots,
};
