// src/controllers/superadmin/salonController.js
const bcrypt = require("bcryptjs");
const { supabaseAdmin } = require("../../supabase");

// helper to validate required fields in body
function need(body, field) {
  if (!body[field] || String(body[field]).trim() === "") {
    throw new Error(`Missing field: ${field}`);
  }
}

// GET /api/superadmin/salons
// List all salons for dashboard
async function listSalons(req, res) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("salons")
      .select(
        "id, name, city, phone, whatsapp, plan_type, is_active, brand_color, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listSalons error:", error);
      return res.status(500).json({
        ok: false,
        error: "LIST_SALONS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      salons: data || [],
    });
  } catch (err) {
    console.error("listSalons fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/superadmin/salons
// Create a new salon and owner account
async function createSalon(req, res) {
  try {
    need(req.body, "name");
    need(req.body, "plan_type");      // "basic" or "premium"
    need(req.body, "ownerEmail");
    need(req.body, "ownerPassword");

    const {
      name,
      city,
      address,
      phone,
      whatsapp,
      brand_color,
      plan_type,       // "basic" | "premium"
      ownerEmail,
      ownerPassword,
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // 1. Insert salon row
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .insert([
        {
          name,
          city: city || null,
          address: address || null,
          phone: phone || null,
          whatsapp: whatsapp || null,
          brand_color: brand_color || "#E39B34",
          plan_type,
          is_active: true,
        },
      ])
      .select("*")
      .single();

    if (salonErr) {
      console.error("Failed to insert salon:", salonErr);
      return res.status(500).json({
        ok: false,
        error: "SALON_INSERT_FAILED",
        details: salonErr.message,
      });
    }

    const salonId = salonRow.id;

    // 2. Hash password for owner user
    const password_hash = await bcrypt.hash(ownerPassword, 10);

    // 3. Insert owner user in salon_users
    const { data: ownerRow, error: ownerErr } = await supabaseAdmin
      .from("salon_users")
      .insert([
        {
          salon_id: salonId,
          email: ownerEmail,
          password_hash,
          role: "owner",
          is_active: true,
        },
      ])
      .select("id, salon_id, email, role, is_active, created_at, updated_at")
      .single();

    if (ownerErr) {
      console.error("Failed to insert salon owner:", ownerErr);

      // rollback salon if user creation failed
      await supabaseAdmin.from("salons").delete().eq("id", salonId);

      return res.status(400).json({
        ok: false,
        error: "OWNER_INSERT_FAILED",
        details: ownerErr.message,
      });
    }

    // Return success
    return res.status(201).json({
      ok: true,
      salon: salonRow,
      ownerUser: ownerRow,
    });
  } catch (err) {
    console.error("createSalon fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// DELETE /api/superadmin/salons/:salonId
// Hard delete a salon (and via ON DELETE CASCADE, its salon_users)
async function deleteSalon(req, res) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    // Check salon exists first (for nice messages in UI)
    const { data: salonCheck, error: checkErr } = await supabaseAdmin
      .from("salons")
      .select("id, name")
      .eq("id", salonId)
      .single();

    if (checkErr || !salonCheck) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Delete salon
    const { error: delErr } = await supabaseAdmin
      .from("salons")
      .delete()
      .eq("id", salonId);

    if (delErr) {
      console.error("deleteSalon error:", delErr);
      return res.status(500).json({
        ok: false,
        error: "DELETE_FAILED",
        details: delErr.message,
      });
    }

    return res.json({
      ok: true,
      deletedSalonId: salonId,
      deletedSalonName: salonCheck.name,
    });
  } catch (err) {
    console.error("deleteSalon fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}
// GET /api/superadmin/salons/:salonId
async function getSalonById(req, res) {
  try {
    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Get the salon
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select(
        `
        id,
        name,
        city,
        address,
        phone,
        whatsapp,
        brand_color,
        plan_type,
        is_active,
        created_at,
        updated_at
      `
      )
      .eq("id", salonId)
      .single();

    if (salonErr || !salonRow) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Get the primary owner (first user with role=owner)
    const { data: ownerRow, error: ownerErr } = await supabaseAdmin
      .from("salon_users")
      .select(
        `
        id,
        email,
        role,
        is_active,
        created_at,
        updated_at
      `
      )
      .eq("salon_id", salonId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    // ownerErr is not fatal. We just won't include owner if none.
    return res.json({
      ok: true,
      salon: salonRow,
      owner: ownerRow || null,
    });
  } catch (err) {
    console.error("getSalonById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}
// PATCH /api/superadmin/salons/:salonId
// Update salon info (name, contact, plan, status, etc.)
async function updateSalon(req, res) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { salonId } = req.params;
    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    // We accept only fields we allow the super admin to edit
    // Anything else in req.body will be ignored so we don't accidentally
    // overwrite columns like created_at, etc.
    const {
      name,
      city,
      address,
      phone,
      whatsapp,
      brand_color,
      plan_type,
      is_active,
    } = req.body;

    // Build partial update object by only including defined keys
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (city !== undefined) updates.city = city;
    if (address !== undefined) updates.address = address;
    if (phone !== undefined) updates.phone = phone;
    if (whatsapp !== undefined) updates.whatsapp = whatsapp;
    if (brand_color !== undefined) updates.brand_color = brand_color;
    if (plan_type !== undefined) updates.plan_type = plan_type;
    if (is_active !== undefined) updates.is_active = is_active;

    // If no valid fields were provided
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "NO_VALID_FIELDS",
      });
    }

    // Always update updated_at timestamp for auditing
    updates.updated_at = new Date().toISOString();

    // Perform update
    const { data: updatedSalon, error: updateErr } = await supabaseAdmin
      .from("salons")
      .update(updates)
      .eq("id", salonId)
      .select(
        `
        id,
        name,
        city,
        address,
        phone,
        whatsapp,
        brand_color,
        plan_type,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (updateErr) {
      console.error("updateSalon error:", updateErr);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_FAILED",
        details: updateErr.message,
      });
    }

    // Send back the fresh row
    return res.json({
      ok: true,
      salon: updatedSalon,
    });
  } catch (err) {
    console.error("updateSalon fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}


module.exports = {
  listSalons,
  createSalon,
  deleteSalon,
  getSalonById,
  updateSalon,
};
