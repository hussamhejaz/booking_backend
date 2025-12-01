// src/controllers/owner/notificationController.js
const { supabaseAdmin } = require("../../supabase");

// GET /api/owner/notifications (or /bookings)
// Lists booking notifications for a salon with pagination and optional filters.
async function listNotifications(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const {
      page = 1,
      limit = 20,
      status, // optional: unread/read
      since, // optional ISO date string
    } = req.query;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const from = (parsedPage - 1) * parsedLimit;
    const to = from + parsedLimit - 1;

    let query = supabaseAdmin
      .from("booking_notifications")
      .select(
        `
          id,
          salon_id,
          booking_id,
          home_booking_id,
          title,
          message,
          status,
          created_at,
          read_at,
          metadata
        `,
        { count: "exact" }
      )
      .eq("salon_id", salonId);

    if (status) {
      query = query.eq("status", status);
    }

    if (since && typeof since === "string" && since.trim()) {
      const parsed = new Date(since);
      if (!Number.isNaN(parsed.getTime())) {
        query = query.gte("created_at", parsed.toISOString());
      }
    }

    const { data: notifications, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("listNotifications error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_NOTIFICATIONS_FAILED",
      });
    }

    const total = typeof count === "number" ? count : notifications?.length || 0;
    const pages = Math.max(1, Math.ceil(total / parsedLimit));

    return res.json({
      ok: true,
      notifications: notifications || [],
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages,
      },
    });
  } catch (err) {
    console.error("listNotifications fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

async function markNotificationRead(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ ok: false, error: "MISSING_NOTIFICATION_ID" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" });
    }

    const { data, error } = await supabaseAdmin
      .from("booking_notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("salon_id", salonId)
      .select("id, status, read_at")
      .single();

    if (error || !data) {
      return res.status(500).json({ ok: false, error: "UPDATE_NOTIFICATION_FAILED" });
    }

    return res.json({ ok: true, notification: data });
  } catch (err) {
    console.error("markNotificationRead fatal:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}

module.exports = {
  listNotifications,
  markNotificationRead,
};
