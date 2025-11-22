// src/controllers/owner/homeServiceBookingController.js
const { supabaseAdmin } = require("../../supabase");

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

// GET /api/owner/home-service-bookings
async function listHomeServiceBookings(req, res) {
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
      area
    } = req.query;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    let query = supabaseAdmin
      .from("home_service_bookings")
      .select(`
        *,
        home_services:home_service_id (id, name, price, duration_minutes, category)
      `, { count: 'exact' })
      .eq("salon_id", salonId);

    // Apply filters
    if (status) query = query.eq("status", status);
    if (date) query = query.eq("booking_date", date);
    if (start_date && end_date) {
      query = query.gte("booking_date", start_date).lte("booking_date", end_date);
    }
    if (customer_phone) query = query.ilike("customer_phone", `%${customer_phone}%`);
    if (area) query = query.ilike("customer_area", `%${area}%`);

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: bookings, error, count } = await query
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("listHomeServiceBookings error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_BOOKINGS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      bookings: bookings || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    console.error("listHomeServiceBookings fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/home-service-bookings/:bookingId
async function getHomeServiceBookingById(req, res) {
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
      .from("home_service_bookings")
      .select(`
        *,
        home_services:home_service_id (id, name, description, price, duration_minutes, category)
      `)
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .single();

    if (error || !booking) {
      console.error("getHomeServiceBookingById error:", error);
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
    console.error("getHomeServiceBookingById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/home-service-bookings
async function createHomeServiceBooking(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    need(req.body, "customer_name");
    need(req.body, "customer_phone");
    need(req.body, "customer_area");
    need(req.body, "customer_address");
    need(req.body, "booking_date");
    need(req.body, "booking_time");
    need(req.body, "home_service_id");

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
      travel_fee = 0,
      status = "confirmed",
      special_requirements
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Validate home service belongs to salon
    const { data: homeService } = await supabaseAdmin
      .from("home_services")
      .select("id, name, price, duration_minutes, is_active")
      .eq("id", home_service_id)
      .eq("salon_id", salonId)
      .single();

    if (!homeService) {
      return res.status(404).json({
        ok: false,
        error: "HOME_SERVICE_NOT_FOUND",
      });
    }

    if (!homeService.is_active) {
      return res.status(400).json({
        ok: false,
        error: "SERVICE_NOT_ACTIVE",
        details: "This home service is not currently active"
      });
    }

    // Calculate final price and duration
    const finalPrice = total_price || homeService.price;
    const finalDuration = duration_minutes || homeService.duration_minutes;
    const finalTravelFee = parseFloat(travel_fee) || 0;

    // Check for booking conflicts (time slot availability)
    const conflictCheck = await checkHomeServiceBookingConflict(
      salonId,
      booking_date,
      booking_time,
      finalDuration,
      home_service_id,
      null // No staff assignment
    );

    if (conflictCheck.hasConflict) {
      return res.status(409).json({
        ok: false,
        error: "BOOKING_CONFLICT",
        details: conflictCheck.message,
        conflictingBookings: conflictCheck.conflictingBookings
      });
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
      booking_time,
      duration_minutes: finalDuration,
      service_price: homeService.price,
      travel_fee: finalTravelFee,
      total_price: parseFloat(finalPrice) + finalTravelFee,
      status,
      special_requirements: special_requirements?.trim() || null,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null
    };

    const { data: booking, error } = await supabaseAdmin
      .from("home_service_bookings")
      .insert([insertPayload])
      .select(`
        *,
        home_services:home_service_id (id, name, price, duration_minutes, category)
      `)
      .single();

    if (error) {
      console.error("createHomeServiceBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_BOOKING_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      booking,
    });
  } catch (err) {
    console.error("createHomeServiceBooking fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// In src/controllers/owner/homeServiceBookingController.js


async function updateHomeServiceBooking(req, res) {
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
      customer_area,
      customer_address,
      customer_notes,
      booking_date,
      booking_time,
      duration_minutes,
      travel_fee,
      total_price,
      status,
      home_service_id,
      special_requirements,
      service_price // Add this field
    } = req.body;

    // Verify booking belongs to salon
    const { data: existingBooking, error: checkError } = await supabaseAdmin
      .from("home_service_bookings")
      .select("id, status, booking_date, booking_time, home_service_id, duration_minutes, service_price, travel_fee, total_price")
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
    if ((booking_date || booking_time) && status !== 'cancelled') {
      const checkDate = booking_date || existingBooking.booking_date;
      const checkTime = booking_time || existingBooking.booking_time;
      const checkDuration = duration_minutes || existingBooking.duration_minutes;
      const checkServiceId = home_service_id || existingBooking.home_service_id;

      const conflictCheck = await checkHomeServiceBookingConflict(
        salonId,
        checkDate,
        checkTime,
        checkDuration,
        checkServiceId,
        bookingId // exclude current booking
      );

      if (conflictCheck.hasConflict) {
        return res.status(409).json({
          ok: false,
          error: "BOOKING_CONFLICT",
          details: conflictCheck.message,
          conflictingBookings: conflictCheck.conflictingBookings
        });
      }
    }

    const updates = {};
    if (customer_name !== undefined) updates.customer_name = customer_name;
    if (customer_email !== undefined) updates.customer_email = customer_email;
    if (customer_phone !== undefined) updates.customer_phone = customer_phone;
    if (customer_area !== undefined) updates.customer_area = customer_area;
    if (customer_address !== undefined) updates.customer_address = customer_address;
    if (customer_notes !== undefined) updates.customer_notes = customer_notes;
    if (booking_date !== undefined) updates.booking_date = booking_date;
    if (booking_time !== undefined) updates.booking_time = booking_time;
    if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
    if (travel_fee !== undefined) updates.travel_fee = travel_fee;
    if (home_service_id !== undefined) updates.home_service_id = home_service_id;
    if (special_requirements !== undefined) updates.special_requirements = special_requirements;
    if (service_price !== undefined) updates.service_price = service_price; // Add this line
    
    // Recalculate total price if service price or travel fee changes
    if (service_price !== undefined || travel_fee !== undefined || home_service_id !== undefined) {
      let finalServicePrice = service_price !== undefined ? parseFloat(service_price) : existingBooking.service_price;
      
      // If home service is changed, get the new service price
      if (home_service_id && home_service_id !== existingBooking.home_service_id) {
        const { data: newService } = await supabaseAdmin
          .from("home_services")
          .select("price")
          .eq("id", home_service_id)
          .single();
        if (newService) {
          finalServicePrice = newService.price;
          updates.service_price = finalServicePrice;
        }
      }
      
      const finalTravelFee = travel_fee !== undefined ? parseFloat(travel_fee) : existingBooking.travel_fee;
      updates.total_price = (parseFloat(finalServicePrice) + parseFloat(finalTravelFee)).toFixed(2);
    } else if (total_price !== undefined) {
      updates.total_price = total_price;
    }
    
    // Handle status changes and timestamps
    if (status !== undefined && status !== existingBooking.status) {
      updates.status = status;
      
      if (status === "confirmed") {
        updates.confirmed_at = new Date().toISOString();
      } else if (status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
      } else if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
    }

    updates.updated_at = new Date().toISOString();

    console.log('Updating home service booking with:', updates); // Debug log

    const { data: booking, error } = await supabaseAdmin
      .from("home_service_bookings")
      .update(updates)
      .eq("id", bookingId)
      .eq("salon_id", salonId)
      .select(`
        *,
        home_services:home_service_id (id, name, price, duration_minutes, category)
      `)
      .single();

    if (error) {
      console.error("updateHomeServiceBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_BOOKING_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      booking,
    });
  } catch (err) {
    console.error("updateHomeServiceBooking fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message // Add this for debugging
    });
  }
}

// DELETE /api/owner/home-service-bookings/:bookingId
async function deleteHomeServiceBooking(req, res) {
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
      .from("home_service_bookings")
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
      .from("home_service_bookings")
      .delete()
      .eq("id", bookingId)
      .eq("salon_id", salonId);

    if (error) {
      console.error("deleteHomeServiceBooking error:", error);
      return res.status(500).json({
        ok: false,
        error: "DELETE_BOOKING_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      message: `Home service booking for ${existingBooking.customer_name} has been permanently deleted`
    });
  } catch (err) {
    console.error("deleteHomeServiceBooking fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/home-service-bookings/stats/overview
async function getHomeServiceBookingStats(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { start_date, end_date } = req.query;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    let dateFilter = {};
    if (start_date && end_date) {
      dateFilter = { gte: start_date, lte: end_date };
    } else if (start_date) {
      dateFilter = { gte: start_date };
    } else if (end_date) {
      dateFilter = { lte: end_date };
    }

    // Get booking counts by status
    const { data: statusCounts } = await supabaseAdmin
      .from("home_service_bookings")
      .select("status", { count: "exact" })
      .eq("salon_id", salonId)
      .match(dateFilter);

    // Get revenue stats
    const { data: revenueData } = await supabaseAdmin
      .from("home_service_bookings")
      .select("total_price, travel_fee")
      .eq("salon_id", salonId)
      .in("status", ["confirmed", "completed"])
      .match(dateFilter);

    // Get popular home services
    const { data: popularServices } = await supabaseAdmin
      .from("home_service_bookings")
      .select(`
        home_service_id,
        home_services!inner(name, category)
      `)
      .eq("salon_id", salonId)
      .in("status", ["confirmed", "completed"])
      .match(dateFilter)
      .limit(5);

    // Get areas served
    const { data: areasData } = await supabaseAdmin
      .from("home_service_bookings")
      .select("customer_area")
      .eq("salon_id", salonId)
      .match(dateFilter);

    const totalRevenue = revenueData?.reduce((sum, booking) => 
      sum + parseFloat(booking.total_price || 0), 0) || 0;
    const totalTravelFees = revenueData?.reduce((sum, booking) => 
      sum + parseFloat(booking.travel_fee || 0), 0) || 0;
    const totalBookings = statusCounts?.length || 0;

    const stats = {
      total_bookings: totalBookings,
      total_revenue: totalRevenue,
      total_travel_fees: totalTravelFees,
      by_status: statusCounts?.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {}) || {},
      popular_services: popularServices || [],
      areas_served: [...new Set(areasData?.map(item => item.customer_area) || [])]
    };

    return res.json({
      ok: true,
      stats,
      period: { start_date, end_date }
    });
  } catch (err) {
    console.error("getHomeServiceBookingStats fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// Helper function to check home service booking conflicts
async function checkHomeServiceBookingConflict(salonId, date, time, duration, serviceId, excludeBookingId = null) {
  const bookingTime = new Date(`${date}T${time}`);
  const endTime = new Date(bookingTime.getTime() + duration * 60000);

  let query = supabaseAdmin
    .from("home_service_bookings")
    .select("customer_name, booking_time, duration_minutes")
    .eq("salon_id", salonId)
    .eq("booking_date", date)
    .in("status", ["confirmed", "pending"])
    .lt("booking_time", endTime.toTimeString().slice(0, 8))
    .gt("booking_time", new Date(bookingTime.getTime() - duration * 60000).toTimeString().slice(0, 8));

  // Exclude current booking when updating
  if (excludeBookingId) {
    query = query.neq("id", excludeBookingId);
  }

  const { data: overlappingBookings } = await query;

  if (overlappingBookings && overlappingBookings.length > 0) {
    return {
      hasConflict: true,
      message: "Time slot overlaps with existing home service booking",
      conflictingBookings: overlappingBookings
    };
  }

  return { hasConflict: false };
}

module.exports = {
  listHomeServiceBookings,
  getHomeServiceBookingById,
  createHomeServiceBooking,
  updateHomeServiceBooking,
  deleteHomeServiceBooking,
  getHomeServiceBookingStats,
};
