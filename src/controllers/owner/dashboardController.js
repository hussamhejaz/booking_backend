// src/controllers/owner/dashboardController.js
const { supabaseAdmin } = require("../../supabase");

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartDate() {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

function daysAgoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function countQuery(builder, label) {
  const { count, error } = await builder;
  if (error) {
    console.error(`dashboard ${label} count error:`, error);
    return 0;
  }
  return count || 0;
}

async function sumBookingTotals(builder, label) {
  const { data, error } = await builder;
  if (error) {
    console.error(`dashboard ${label} sum error:`, error);
    return 0;
  }

  return (data || []).reduce((sum, row) => {
    const value = parseFloat(row.total_price);
    return sum + (isNaN(value) ? 0 : value);
  }, 0);
}

function normalizeStatus(status = "") {
  return status.toLowerCase();
}

function buildDailySeries(startDateISO, endDateISO, salonRows = [], homeRows = []) {
  const start = new Date(startDateISO);
  const end = new Date(endDateISO);

  const map = {};
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    map[key] = { salon: 0, home: 0, revenue: 0 };
  }

  const canceledStatuses = new Set(["cancelled", "canceled"]);

  salonRows.forEach((row) => {
    if (!row || !row.booking_date || !map[row.booking_date]) return;
    const status = normalizeStatus(row.status);
    if (!canceledStatuses.has(status)) {
      map[row.booking_date].salon += 1;
    }
    const price = parseFloat(row.total_price);
    if (!Number.isNaN(price)) {
      map[row.booking_date].revenue += price;
    }
  });

  homeRows.forEach((row) => {
    if (!row || !row.booking_date || !map[row.booking_date]) return;
    const status = normalizeStatus(row.status);
    if (!canceledStatuses.has(status)) {
      map[row.booking_date].home += 1;
    }
    const price = parseFloat(row.total_price);
    if (!Number.isNaN(price)) {
      map[row.booking_date].revenue += price;
    }
  });

  return Object.keys(map)
    .sort()
    .map((date) => ({
      date,
      salon: map[date].salon,
      home: map[date].home,
      revenue: Number(map[date].revenue.toFixed(2)),
    }));
}

async function getDashboardSummary(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const today = todayDate();
    const monthStart = monthStartDate();
    const chartStart = daysAgoDate(13); // include today + previous 13 days

    // Fire off independent queries concurrently
    const [
      salonResp,
      totalBookings,
      todaysBookings,
      upcomingBookings,
      cancelledBookings,
      totalHomeBookings,
      todaysHomeBookings,
      activeOffers,
      totalServices,
      totalHomeServices,
      monthlyBookingsRevenue,
      monthlyHomeBookingsRevenue,
      recentBookingsResp,
      recentHomeBookingsResp,
      salonRangeResp,
      homeRangeResp,
    ] = await Promise.all([
      supabaseAdmin
        .from("salons")
        .select("id, name, plan_type, is_active")
        .eq("id", salonId)
        .single(),
      countQuery(
        supabaseAdmin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId),
        "totalBookings"
      ),
      countQuery(
        supabaseAdmin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId)
          .eq("booking_date", today),
        "todaysBookings"
      ),
      countQuery(
        supabaseAdmin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId)
          .gte("booking_date", today)
          .in("status", ["confirmed", "pending"]),
        "upcomingBookings"
      ),
      countQuery(
        supabaseAdmin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId)
          .eq("status", "cancelled"),
        "cancelledBookings"
      ),
      countQuery(
        supabaseAdmin
          .from("home_service_bookings")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId),
        "totalHomeServiceBookings"
      ),
      countQuery(
        supabaseAdmin
          .from("home_service_bookings")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId)
          .eq("booking_date", today),
        "todaysHomeServiceBookings"
      ),
      countQuery(
        supabaseAdmin
          .from("offers")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId)
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today),
        "activeOffers"
      ),
      countQuery(
        supabaseAdmin
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId),
        "services"
      ),
      countQuery(
        supabaseAdmin
          .from("home_services")
          .select("id", { count: "exact", head: true })
          .eq("salon_id", salonId),
        "homeServices"
      ),
      sumBookingTotals(
        supabaseAdmin
          .from("bookings")
          .select("total_price")
          .eq("salon_id", salonId)
          .gte("booking_date", monthStart),
        "monthlyBookingsRevenue"
      ),
      sumBookingTotals(
        supabaseAdmin
          .from("home_service_bookings")
          .select("total_price")
          .eq("salon_id", salonId)
          .gte("booking_date", monthStart),
        "monthlyHomeBookingsRevenue"
      ),
      supabaseAdmin
        .from("bookings")
        .select(
          `
          id,
          customer_name,
          booking_date,
          booking_time,
          status,
          total_price,
          services:service_id (id, name),
          home_services:home_service_id (id, name)
        `
        )
        .eq("salon_id", salonId)
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("home_service_bookings")
        .select(
          `
          id,
          customer_name,
          booking_date,
          booking_time,
          status,
          total_price,
          customer_area,
          home_services:home_service_id (id, name)
        `
        )
        .eq("salon_id", salonId)
        .order("booking_date", { ascending: false })
        .order("booking_time", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("bookings")
        .select("booking_date, total_price, status")
        .eq("salon_id", salonId)
        .gte("booking_date", chartStart)
        .lte("booking_date", today),
      supabaseAdmin
        .from("home_service_bookings")
        .select("booking_date, total_price, status")
        .eq("salon_id", salonId)
        .gte("booking_date", chartStart)
        .lte("booking_date", today),
    ]);

    if (salonResp.error) {
      console.error("dashboard salon error:", salonResp.error);
    }

    const recentBookings = recentBookingsResp.error
      ? []
      : recentBookingsResp.data || [];
    if (recentBookingsResp.error) {
      console.error("dashboard recent bookings error:", recentBookingsResp.error);
    }

    const recentHomeBookings = recentHomeBookingsResp.error
      ? []
      : recentHomeBookingsResp.data || [];
    if (recentHomeBookingsResp.error) {
      console.error(
        "dashboard recent home bookings error:",
        recentHomeBookingsResp.error
      );
    }

    const salonRangeData = salonRangeResp.error ? [] : salonRangeResp.data || [];
    if (salonRangeResp.error) {
      console.error("dashboard salon range error:", salonRangeResp.error);
    }

    const homeRangeData = homeRangeResp.error ? [] : homeRangeResp.data || [];
    if (homeRangeResp.error) {
      console.error("dashboard home range error:", homeRangeResp.error);
    }

    const bookingsDaily = buildDailySeries(chartStart, today, salonRangeData, homeRangeData);

    return res.json({
      ok: true,
      dashboard: {
        salon: salonResp.data || null,
        metrics: {
          totalBookings,
          todaysBookings,
          upcomingBookings,
          cancelledBookings,
          totalHomeServiceBookings: totalHomeBookings,
          todaysHomeServiceBookings: todaysHomeBookings,
          activeOffers,
          totalServices,
          totalHomeServices,
          monthlyRevenue: monthlyBookingsRevenue + monthlyHomeBookingsRevenue,
        },
        lists: {
          recentBookings,
          recentHomeServiceBookings: recentHomeBookings,
        },
        charts: {
          bookingsDaily,
        },
      },
    });
  } catch (err) {
    console.error("getDashboardSummary fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  getDashboardSummary,
};
