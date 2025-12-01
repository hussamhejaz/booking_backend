// src/controllers/owner/bookingController.js
const { supabaseAdmin } = require("../../supabase");
const {
  parseArchiveParams,
  applyArchiveFilters,
  validateArchiveAction,
} = require("./bookingArchiveUtils");
const { recordBookingNotification } = require("../../utils/notifications");

// Simple in-memory cache (consider Redis for production)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function
function need(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

function applyBookingFilters(query, filters) {
  const {
    status,
    date,
    start_date,
    end_date,
    customer_phone,
    service_type,
  } = filters;

  if (status) query = query.eq("status", status);
  if (date) query = query.eq("booking_date", date);
  if (start_date && end_date) {
    query = query.gte("booking_date", start_date).lte("booking_date", end_date);
  }
  if (customer_phone) {
    query = query.ilike("customer_phone", `%${customer_phone}%`);
  }
  if (service_type === "salon") {
    query = query.not("service_id", "is", null);
  }
  if (service_type === "home") {
    query = query.not("home_service_id", "is", null);
  }

  return query;
}

function isPaidStatus(status) {
  return status === "confirmed" || status === "completed";
}

// GET /api/owner/bookings
async function listBookings(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const {
      page = 1,
      limit = 20,
      status,
      date,
    start_date,
    end_date,
    customer_phone,
    service_type,
    include_archived,
    archived_only,
    nocache = false,
  } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
    const from = (parsedPage - 1) * parsedLimit;
    const to = from + parsedLimit - 1;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const cacheKey = `bookings:${salonId}:${JSON.stringify(req.query)}`;

    if (!nocache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }
      cache.delete(cacheKey);
    }

    const filters = {
      status,
      date,
      start_date,
      end_date,
      customer_phone,
      service_type,
    };
    const archiveFilters = parseArchiveParams({
      include_archived,
      archived_only,
    });

    const baseQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        salon_id,
        customer_name,
        customer_phone,
        customer_email,
        customer_notes,
        booking_date,
        booking_time,
        duration_minutes,
        total_price,
        status,
        archived,
        archived_at,
        archived_by,
        service_id,
        home_service_id,
        offer_id,
        source,
        confirmed_at,
        cancelled_at,
        completed_at,
        created_at,
        updated_at
      `,
        { count: "exact" }
      )
      .eq("salon_id", salonId);

    const filteredQuery = applyArchiveFilters(
      applyBookingFilters(baseQuery, filters),
      archiveFilters
    );

    const { data: bookings = [], count, error } = await filteredQuery
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("listBookings error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_BOOKINGS_FAILED",
        details: error.message,
      });
    }

    const totalCount = typeof count === "number" ? count : bookings.length;

    const serviceIds = [
      ...new Set(
        bookings
          .filter((booking) => booking.service_id)
          .map((booking) => booking.service_id)
      ),
    ];
    const homeServiceIds = [
      ...new Set(
        bookings
          .filter((booking) => booking.home_service_id)
          .map((booking) => booking.home_service_id)
      ),
    ];

    const servicePromise =
      serviceIds.length > 0
        ? supabaseAdmin
            .from("services")
            .select("id, name, price, duration_minutes")
            .eq("salon_id", salonId)
            .in("id", serviceIds)
        : Promise.resolve({ data: [], error: null });

    const homeServicePromise =
      homeServiceIds.length > 0
        ? supabaseAdmin
            .from("home_services")
            .select("id, name, price, duration_minutes, category")
            .eq("salon_id", salonId)
            .in("id", homeServiceIds)
        : Promise.resolve({ data: [], error: null });

    const [servicesResult, homeServicesResult] = await Promise.all([
      servicePromise,
      homeServicePromise,
    ]);

    if (servicesResult.error) {
      console.error("listBookings services lookup error:", servicesResult.error);
    }
    if (homeServicesResult.error) {
      console.error(
        "listBookings home services lookup error:",
        homeServicesResult.error
      );
    }

    const serviceMap = new Map(
      (servicesResult.data || []).map((service) => [service.id, service])
    );
    const homeServiceMap = new Map(
      (homeServicesResult.data || []).map((service) => [service.id, service])
    );

    const enrichedBookings = bookings.map((booking) => ({
      ...booking,
      services: booking.service_id
        ? serviceMap.get(booking.service_id) || null
        : null,
      home_services: booking.home_service_id
        ? homeServiceMap.get(booking.home_service_id) || null
        : null,
    }));

    const response = {
      ok: true,
      bookings: enrichedBookings,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalCount,
        pages: Math.ceil(totalCount / parsedLimit),
      },
    };

    if (
      !date &&
      !start_date &&
      !end_date &&
      !customer_phone &&
      !status &&
      !service_type
    ) {
      cache.set(cacheKey, {
        data: response,
        timestamp: Date.now(),
      });
    }

    return res.json(response);
  } catch (err) {
    console.error("listBookings fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/bookings/:bookingId
async function getBookingById(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { bookingId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(`
        *,
        services:service_id (id, name, description, price, duration_minutes),
        home_services:home_service_id (id, name, description, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `)
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .single();

    if (error || !booking) {
      console.error("getBookingById error:", error);
      return res.status(404).json({
        ok: false,
        error: "BOOKING_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      booking,
    });
  } catch (err) {
    console.error("getBookingById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/bookings
async function createBooking(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    need(req.body, "customer_name");
    need(req.body, "customer_phone");
    need(req.body, "booking_date");
    need(req.body, "booking_time");

    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_notes,
      booking_date,
      booking_time,
      service_id,
      home_service_id,
      duration_minutes,
      total_price,
      status = "confirmed",
      source = "owner",
      offer_id, // optional; may be null
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    if (!service_id && !home_service_id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SERVICE",
        details: "Either service_id or home_service_id must be provided",
      });
    }

    // Single service validation query
    let serviceQuery = null;
    if (service_id) {
      serviceQuery = supabaseAdmin
        .from("services")
        .select("id, price, duration_minutes")
        .eq("id", service_id)
        .eq("salon_id", salonId)
        .single();
    } else if (home_service_id) {
      serviceQuery = supabaseAdmin
        .from("home_services")
        .select("id, price, duration_minutes")
        .eq("id", home_service_id)
        .eq("salon_id", salonId)
        .single();
    }

    const { data: serviceData, error: serviceError } = await serviceQuery;

    if (serviceError || !serviceData) {
      return res.status(404).json({
        ok: false,
        error: service_id ? "SERVICE_NOT_FOUND" : "HOME_SERVICE_NOT_FOUND",
      });
    }

    const finalPrice = total_price || serviceData.price;
    const finalDuration = duration_minutes || serviceData.duration_minutes || 30;

    // Check for booking conflicts
    const conflictCheck = await checkBookingConflict(
      salonId,
      booking_date,
      booking_time,
      finalDuration,
      service_id,
      home_service_id
    );

    if (conflictCheck.hasConflict) {
      return res.status(409).json({
        ok: false,
        error: "BOOKING_CONFLICT",
        details: conflictCheck.message,
        conflictingBookings: conflictCheck.conflictingBookings,
      });
    }

    const insertPayload = {
      salon_id: salonId,
      service_id: service_id || null,
      home_service_id: home_service_id || null,
      offer_id: offer_id || null, // link booking to offer (optional)
      customer_name: customer_name.trim(),
      customer_email: customer_email?.trim() || null,
      customer_phone: customer_phone.trim(),
      customer_notes: customer_notes?.trim() || null,
      booking_date,
      booking_time,
      duration_minutes: finalDuration,
      total_price: finalPrice,
      status,
      source,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
    };

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert([insertPayload])
      .select(`
        *,
        services:service_id (id, name, price, duration_minutes),
        home_services:home_service_id (id, name, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `)
      .single();

    if (error) {
      console.error("createBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_BOOKING_FAILED",
        details: error.message,
      });
    }

    // Fire-and-forget notification for owner-created bookings too
    recordBookingNotification({
      salonId,
      bookingId: booking?.id || null,
      title: "New booking created",
      message: `${booking.customer_name || "Customer"} booked on ${booking.booking_date} at ${booking.booking_time}`,
      metadata: {
        booking_id: booking?.id,
        booking_date: booking?.booking_date,
        booking_time: booking?.booking_time,
        status: booking?.status,
        customer_name: booking?.customer_name,
        customer_phone: booking?.customer_phone,
        service_id: booking?.service_id,
        home_service_id: booking?.home_service_id,
      },
    });

    // Clear relevant caches after creating a new booking
    clearBookingCaches(salonId);

    return res.status(201).json({
      ok: true,
      booking,
    });
  } catch (err) {
    console.error("createBooking fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// PATCH /api/owner/bookings/:bookingId
async function updateBooking(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_BOOKING_ID",
      });
    }

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
      booking_date,
      booking_time,
      duration_minutes,
      total_price,
      status,
      service_id,
      home_service_id,
      offer_id,
    } = req.body;

    // Verify booking belongs to salon and get existing data in one query
    const { data: existingBooking, error: checkError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, status, booking_date, booking_time, service_id, home_service_id, duration_minutes, customer_name"
      )
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .single();

    if (checkError || !existingBooking) {
      return res.status(404).json({
        ok: false,
        error: "BOOKING_NOT_FOUND",
      });
    }

    // Check for conflicts if date/time is being updated
    if ((booking_date || booking_time) && status !== "cancelled") {
      const checkDate = booking_date || existingBooking.booking_date;
      const checkTime = booking_time || existingBooking.booking_time;
      const checkDuration = duration_minutes || existingBooking.duration_minutes;
      const checkServiceId = service_id || existingBooking.service_id;
      const checkHomeServiceId =
        home_service_id || existingBooking.home_service_id;

      const conflictCheck = await checkBookingConflict(
        salonId,
        checkDate,
        checkTime,
        checkDuration,
        checkServiceId,
        checkHomeServiceId,
        bookingId // exclude current booking
      );

      if (conflictCheck.hasConflict) {
        return res.status(409).json({
          ok: false,
          error: "BOOKING_CONFLICT",
          details: conflictCheck.message,
          conflictingBookings: conflictCheck.conflictingBookings,
        });
      }
    }

    const updates = {};
    if (customer_name !== undefined) updates.customer_name = customer_name;
    if (customer_email !== undefined) updates.customer_email = customer_email;
    if (customer_phone !== undefined) updates.customer_phone = customer_phone;
    if (customer_notes !== undefined) updates.customer_notes = customer_notes;
    if (booking_date !== undefined) updates.booking_date = booking_date;
    if (booking_time !== undefined) updates.booking_time = booking_time;
    if (duration_minutes !== undefined)
      updates.duration_minutes = duration_minutes;
    if (total_price !== undefined) updates.total_price = total_price;
    if (service_id !== undefined) updates.service_id = service_id;
    if (home_service_id !== undefined) updates.home_service_id = home_service_id;
    if (offer_id !== undefined) updates.offer_id = offer_id;

    // Handle status changes and timestamps
    if (status !== undefined && status !== existingBooking.status) {
      updates.status = status;

      if (status === "confirmed") {
        updates.confirmed_at = new Date().toISOString();
      } else if (status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
      } else if (status === "completed") {
        updates.completed_at = new Date().toISOString();
        // auto-archive completed bookings so they only appear in archive views
        updates.archived = true;
        updates.archived_at = new Date().toISOString();
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .update(updates)
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .select(`
        *,
        services:service_id (id, name, price, duration_minutes),
        home_services:home_service_id (id, name, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `)
      .single();

    if (error) {
      console.error("updateBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_BOOKING_FAILED",
        details: error.message,
      });
    }

    // Clear relevant caches after updating booking
    clearBookingCaches(salonId);

    return res.json({
      ok: true,
      booking,
    });
  } catch (err) {
    console.error("updateBooking fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// DELETE /api/owner/bookings/:bookingId
async function deleteBooking(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_BOOKING_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Verify booking belongs to salon
    const { data: existingBooking, error: checkError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_name")
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .single();

    if (checkError || !existingBooking) {
      return res.status(404).json({
        ok: false,
        error: "BOOKING_NOT_FOUND",
      });
    }

    // Hard delete booking
    const { error } = await supabaseAdmin
      .from("bookings")
      .delete()
      .eq("id", bookingId)
      .eq("salon_id", salonId);

    if (error) {
      console.error("deleteBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "DELETE_BOOKING_FAILED",
        details: error.message,
      });
    }

    // Clear relevant caches after deleting booking
    clearBookingCaches(salonId);

    return res.json({
      ok: true,
      message: `Booking for ${existingBooking.customer_name} has been permanently deleted`,
    });
  } catch (err) {
    console.error("deleteBooking fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/bookings/:bookingId/archive
async function archiveBooking(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_BOOKING_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        services:service_id (id, name, price, duration_minutes),
        home_services:home_service_id (id, name, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `
      )
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({
        ok: false,
        error: "BOOKING_NOT_FOUND",
      });
    }

    const validation = validateArchiveAction(booking, "archive");
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: validation.code,
      });
    }

    if (validation.already) {
      return res.json({
        ok: true,
        booking,
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("bookings")
      .update({
        archived: true,
        archived_at: now,
        archived_by: req.ownerUser?.id || null,
        updated_at: now,
      })
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .select(
        `
        *,
        services:service_id (id, name, price, duration_minutes),
        home_services:home_service_id (id, name, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `
      )
      .single();

    if (error) {
      console.error("archiveBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "ARCHIVE_BOOKING_FAILED",
      });
    }

    clearBookingCaches(salonId);

    return res.json({
      ok: true,
      booking: updated,
    });
  } catch (err) {
    console.error("archiveBooking fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/bookings/:bookingId/unarchive
async function unarchiveBooking(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_BOOKING_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        services:service_id (id, name, price, duration_minutes),
        home_services:home_service_id (id, name, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `
      )
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({
        ok: false,
        error: "BOOKING_NOT_FOUND",
      });
    }

    const validation = validateArchiveAction(booking, "unarchive");
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: validation.code,
      });
    }

    if (validation.already) {
      return res.json({
        ok: true,
        booking,
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("bookings")
      .update({
        archived: false,
        archived_at: null,
        archived_by: null,
        updated_at: now,
      })
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .select(
        `
        *,
        services:service_id (id, name, price, duration_minutes),
        home_services:home_service_id (id, name, price, duration_minutes, category),
        offers:offer_id (id, title, final_price)
      `
      )
      .single();

    if (error) {
      console.error("unarchiveBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "UNARCHIVE_BOOKING_FAILED",
      });
    }

    clearBookingCaches(salonId);

    return res.json({
      ok: true,
      booking: updated,
    });
  } catch (err) {
    console.error("unarchiveBooking fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/bookings/calendar/availability
async function getAvailability(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { date, service_id, home_service_id, duration_minutes } = req.query;

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

    const cacheKey = `availability:${salonId}:${date}:${duration_minutes || "default"}`;

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }
      cache.delete(cacheKey);
    }

    // Get working hours for the salon (single row model)
    const { data: workingHours } = await supabaseAdmin
      .from("working_hours")
      .select("*")
      .eq("salon_id", salonId)
      .single();

    if (!workingHours) {
      return res.status(404).json({
        ok: false,
        error: "WORKING_HOURS_NOT_FOUND",
      });
    }

    // Get existing bookings for the date
    const { data: existingBookings } = await supabaseAdmin
      .from("bookings")
      .select("booking_time, duration_minutes")
      .eq("salon_id", salonId)
      .eq("booking_date", date)
      .in("status", ["confirmed", "pending"]);

    const availableSlots = calculateAvailableSlots(
      workingHours,
      existingBookings || [],
      duration_minutes ? parseInt(duration_minutes, 10) : null
    );

    const response = {
      ok: true,
      date,
      available_slots: availableSlots,
      working_hours: workingHours,
    };

    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    return res.json(response);
  } catch (err) {
    console.error("getAvailability fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/bookings/stats/overview
async function getBookingStats(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { start_date, end_date, service_type, nocache = false } = req.query;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const cacheKey = `stats:${salonId}:${start_date || "all"}:${end_date || "all"}:${service_type || "all"}`;

    if (!nocache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }
      cache.delete(cacheKey);
    }

    let query = supabaseAdmin
      .from("bookings")
      .select(`
        id,
        status,
        total_price,
        service_id,
        home_service_id,
        services(name),
        home_services(name)
      `)
      .eq("salon_id", salonId);

    query = applyBookingFilters(query, { service_type });

    if (start_date && end_date) {
      query = query.gte("booking_date", start_date).lte("booking_date", end_date);
    } else if (start_date) {
      query = query.gte("booking_date", start_date);
    } else if (end_date) {
      query = query.lte("booking_date", end_date);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error("getBookingStats error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_STATS_FAILED",
      });
    }

    const statusCounts = {};
    let totalRevenue = 0;
    let paidBookingsCount = 0;
    const serviceCounts = {};

    (bookings || []).forEach((booking) => {
      statusCounts[booking.status] = (statusCounts[booking.status] || 0) + 1;

      const price = Number(booking.total_price) || 0;

      if (isPaidStatus(booking.status)) {
        totalRevenue += price;
        paidBookingsCount += 1;

        const serviceKey = booking.service_id
          ? `service_${booking.service_id}`
          : booking.home_service_id
          ? `home_service_${booking.home_service_id}`
          : null;

        const serviceName = booking.service_id
          ? booking.services?.name || `Service #${booking.service_id}`
          : booking.home_service_id
          ? booking.home_services?.name || `Home service #${booking.home_service_id}`
          : null;

        if (serviceKey && serviceName) {
          serviceCounts[serviceKey] = {
            name: serviceName,
            count: (serviceCounts[serviceKey]?.count || 0) + 1,
            type: booking.service_id ? "salon" : "home",
          };
        }
      }
    });

    const popularServices = Object.values(serviceCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const roundedRevenue = Number.isFinite(totalRevenue)
      ? parseFloat(totalRevenue.toFixed(2))
      : 0;
    const avgTicketValue =
      paidBookingsCount > 0
        ? parseFloat((totalRevenue / paidBookingsCount).toFixed(2))
        : 0;

    const stats = {
      total_bookings: bookings?.length || 0,
      paid_bookings_count: paidBookingsCount,
      total_revenue: roundedRevenue,
      avg_ticket_value: avgTicketValue,
      by_status: statusCounts,
      popular_services: popularServices,
    };

    const response = {
      ok: true,
      stats,
      period: { start_date, end_date },
    };

    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    return res.json(response);
  } catch (err) {
    console.error("getBookingStats fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// Helper function to check booking conflicts
async function checkBookingConflict(
  salonId,
  date,
  time,
  duration,
  serviceId,
  homeServiceId,
  excludeBookingId = null
) {
  const bookingTime = new Date(`${date}T${time}`);
  const endTime = new Date(bookingTime.getTime() + duration * 60000);

  let query = supabaseAdmin
    .from("bookings")
    .select("id, customer_name, booking_time, duration_minutes")
    .eq("salon_id", salonId)
    .eq("booking_date", date)
    .in("status", ["confirmed", "pending"])
    .lt("booking_time", endTime.toTimeString().slice(0, 8))
    .gt(
      "booking_time",
      new Date(bookingTime.getTime() - duration * 60000)
        .toTimeString()
        .slice(0, 8)
    );

  if (excludeBookingId) {
    query = query.neq("id", excludeBookingId);
  }

  const { data: overlappingBookings } = await query;

  if (overlappingBookings && overlappingBookings.length > 0) {
    return {
      hasConflict: true,
      message: "Time slot overlaps with existing booking",
      conflictingBookings: overlappingBookings,
    };
  }

  return { hasConflict: false };
}

// Helper function to calculate available time slots
function calculateAvailableSlots(
  workingHours,
  existingBookings,
  requestedDuration = 30
) {
  const slots = [];
  const slotDuration = 30; // 30-minute intervals
  const dayOfWeek = new Date().getDay();

  const dayKey = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][dayOfWeek];

  if (!workingHours[`${dayKey}_open`] || !workingHours[`${dayKey}_close`]) {
    return slots;
  }

  const openTime = new Date(`1970-01-01T${workingHours[`${dayKey}_open`]}`);
  const closeTime = new Date(`1970-01-01T${workingHours[`${dayKey}_close`]}`);

  let currentTime = new Date(openTime);
  const duration = requestedDuration || 30;

  while (currentTime < closeTime) {
    const slotEnd = new Date(currentTime.getTime() + duration * 60000);

    if (slotEnd <= closeTime) {
      const slotTime = currentTime.toTimeString().slice(0, 5);

      const hasConflict = existingBookings.some((booking) => {
        const bookingTime = new Date(`1970-01-01T${booking.booking_time}`);
        const bookingEnd = new Date(
          bookingTime.getTime() + booking.duration_minutes * 60000
        );

        return (
          (currentTime >= bookingTime && currentTime < bookingEnd) ||
          (slotEnd > bookingTime && slotEnd <= bookingEnd) ||
          (currentTime <= bookingTime && slotEnd >= bookingEnd)
        );
      });

      if (!hasConflict) {
        slots.push(slotTime);
      }
    }

    currentTime = new Date(currentTime.getTime() + slotDuration * 60000);
  }

  return slots;
}

// Helper function to clear relevant caches
function clearBookingCaches(salonId) {
  for (const [key] of cache) {
    if (
      key.startsWith(`bookings:${salonId}`) ||
      key.startsWith(`stats:${salonId}`) ||
      key.startsWith(`availability:${salonId}`)
    ) {
      cache.delete(key);
    }
  }
}

// Helper for batch operations
async function batchProcessBookings(bookingIds, operation) {
  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < bookingIds.length; i += BATCH_SIZE) {
    const batch = bookingIds.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((bookingId) => operation(bookingId));
    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

// Backward compatibility
function cancelBooking(req, res) {
  req.body = { status: "cancelled" };
  return updateBooking(req, res);
}

module.exports = {
  listBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  archiveBooking,
  unarchiveBooking,
  cancelBooking,
  getAvailability,
  getBookingStats,
  batchProcessBookings,
};
