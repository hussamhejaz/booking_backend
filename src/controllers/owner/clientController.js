// src/controllers/owner/clientController.js
const { supabaseAdmin } = require("../../supabase");

function isPaidStatus(status) {
  return status === "confirmed" || status === "completed";
}

function normalizeKey(booking) {
  const phone = booking.customer_phone?.trim();
  if (phone) return `phone:${phone}`;
  const email = booking.customer_email?.trim();
  if (email) return `email:${email.toLowerCase()}`;
  return `anon:${booking.id}`;
}

async function listClients(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const {
      page = 1,
      limit = 20,
      search,
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    let query = supabaseAdmin
      .from("bookings")
      .select(
        `
          id,
          customer_name,
          customer_phone,
          customer_email,
          total_price,
          status,
          booking_date
        `
      )
      .eq("salon_id", salonId);

    if (search) {
      const term = search.trim();
      query = query.or(
        `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`
      );
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error("listClients error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_CLIENTS_FAILED",
      });
    }

    const clientsMap = new Map();

    (bookings || []).forEach((booking) => {
      const key = normalizeKey(booking);
      const existing = clientsMap.get(key) || {
        id: key,
        name: booking.customer_name || "Unknown",
        phone: booking.customer_phone || null,
        email: booking.customer_email || null,
        total_bookings: 0,
        total_revenue: 0,
        last_booking_date: null,
      };

      existing.name = existing.name || booking.customer_name || "Unknown";
      existing.phone = existing.phone || booking.customer_phone || null;
      existing.email = existing.email || booking.customer_email || null;

      existing.total_bookings += 1;

      if (isPaidStatus(booking.status)) {
        const price = Number(booking.total_price) || 0;
        existing.total_revenue += price;
      }

      if (
        booking.booking_date &&
        (!existing.last_booking_date ||
          new Date(booking.booking_date) > new Date(existing.last_booking_date))
      ) {
        existing.last_booking_date = booking.booking_date;
      }

      clientsMap.set(key, existing);
    });

    const clientsArray = Array.from(clientsMap.values())
      .map((client) => ({
        ...client,
        total_revenue: parseFloat((client.total_revenue || 0).toFixed(2)),
      }))
      .sort((a, b) => {
        const dateA = a.last_booking_date ? new Date(a.last_booking_date).getTime() : 0;
        const dateB = b.last_booking_date ? new Date(b.last_booking_date).getTime() : 0;
        return dateB - dateA;
      });

    const total = clientsArray.length;
    const pages = Math.max(1, Math.ceil(total / parsedLimit));
    const start = (parsedPage - 1) * parsedLimit;
    const end = start + parsedLimit;

    const paged = clientsArray.slice(start, end);

    return res.json({
      ok: true,
      clients: paged,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages,
      },
    });
  } catch (err) {
    console.error("listClients fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listClients,
};
