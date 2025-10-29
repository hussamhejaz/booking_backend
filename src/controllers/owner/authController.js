const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { supabaseAdmin } = require("../../supabase");

/**
 * POST /api/owner/auth/login
 * Body: { email, password }
 *
 * Returns:
 * {
 *   ok: true,
 *   token: "...",
 *   user: {
 *     id,
 *     salon_id,
 *     email,
 *     role,
 *     is_active,
 *     salon: { id, name }
 *   }
 * }
 */
async function ownerLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_CREDENTIALS",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // 1. Find the salon user by email
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("salon_users")
      .select(
        `
        id,
        salon_id,
        email,
        password_hash,
        role,
        is_active,
        created_at,
        updated_at
      `
      )
      .ilike("email", email) // case-insensitive
      .limit(1)
      .single();

    if (userErr || !userRow) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_LOGIN", // email not found
      });
    }

    if (!userRow.is_active) {
      return res.status(403).json({
        ok: false,
        error: "ACCOUNT_DISABLED",
      });
    }

    // 2. Check password match
    const good = await bcrypt.compare(password, userRow.password_hash || "");
    if (!good) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_LOGIN", // wrong password
      });
    }

    // 3. Grab salon info (for displaying in dashboard header, etc.)
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id, name, is_active, plan_type")
      .eq("id", userRow.salon_id)
      .single();

    if (salonErr || !salonRow) {
      return res.status(500).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    if (!salonRow.is_active) {
      // salon disabled by superadmin
      return res.status(403).json({
        ok: false,
        error: "SALON_DISABLED",
      });
    }

    // 4. Sign JWT for this owner
    // NOTE: set JWT_SECRET in your .env
    const tokenPayload = {
      sub: userRow.id,
      salon_id: userRow.salon_id,
      role: userRow.role, // "owner"
      type: "salon_user",
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // 5. Return a safe user object (no password_hash)
    return res.json({
      ok: true,
      token,
      user: {
        id: userRow.id,
        salon_id: userRow.salon_id,
        email: userRow.email,
        role: userRow.role,
        is_active: userRow.is_active,
        salon: {
          id: salonRow.id,
          name: salonRow.name,
          plan_type: salonRow.plan_type,
        },
      },
    });
  } catch (err) {
    console.error("ownerLogin fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  ownerLogin,
};
