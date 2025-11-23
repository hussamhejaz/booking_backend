const { supabaseAdmin } = require("../../supabase");

function sanitizePage(val) {
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function sanitizeLimit(val) {
  const parsed = Number.parseInt(val, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 100);
}

// GET /api/owner/contacts
async function listContacts(req, res) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const salonId = req.ownerUser?.salon_id;
    const { page = 1, limit = 20, status, search } = req.query;

    const parsedPage = sanitizePage(page);
    const parsedLimit = sanitizeLimit(limit);
    const from = (parsedPage - 1) * parsedLimit;
    const to = from + parsedLimit - 1;

    let query = supabaseAdmin
      .from("contact_messages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (salonId) {
      query = query.or(`salon_id.eq.${salonId},salon_id.is.null`);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      const searchValue = `%${search}%`;
      query = query.or(
        `message.ilike.${searchValue},name.ilike.${searchValue}`
      );
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error("listContacts error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_CONTACTS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      contacts: data || [],
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: typeof count === "number" ? count : (data || []).length,
        pages: Math.ceil(
          (typeof count === "number" ? count : (data || []).length) /
            parsedLimit
        ),
      },
    });
  } catch (err) {
    console.error("listContacts fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// PATCH /api/owner/contacts/:contactId
async function updateContactStatus(req, res) {
  try {
    const { contactId } = req.params;
    if (!contactId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_CONTACT_ID",
      });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_STATUS",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const salonId = req.ownerUser?.salon_id;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("contact_messages")
      .select("id, salon_id")
      .eq("id", contactId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        ok: false,
        error: "CONTACT_NOT_FOUND",
      });
    }

    if (salonId && existing.salon_id && existing.salon_id !== salonId) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    const updates = {
      status,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("contact_messages")
      .update(updates)
      .eq("id", contactId)
      .single();

    if (error) {
      console.error("updateContactStatus error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_CONTACT_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      contact: data,
    });
  } catch (err) {
    console.error("updateContactStatus fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listContacts,
  updateContactStatus,
};
