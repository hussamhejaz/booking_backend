const bcrypt = require("bcryptjs");
const { supabaseAdmin } = require("../../supabase");

/**
 * GET /api/owner/profile
 * Get the logged-in owner's profile and salon info
 */
async function getProfile(req, res) {
  try {
    const { salon_id, id: userId } = req.ownerUser;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Get user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from("salon_users")
      .select(`
        id,
        email,
        role,
        is_active,
        created_at,
        updated_at
      `)
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        ok: false,
        error: "USER_NOT_FOUND",
      });
    }

    // Get salon info
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select(`
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
      `)
      .eq("id", salon_id)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      profile: {
        user,
        salon
      }
    });

  } catch (err) {
    console.error("getProfile fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

/**
 * PATCH /api/owner/profile
 * Update owner's email (basic profile update)
 */
async function updateProfile(req, res) {
  try {
    const { salon_id, id: userId } = req.ownerUser;
    const { email } = req.body;

    if (!email || String(email).trim() === "") {
      return res.status(400).json({
        ok: false,
        error: "EMAIL_REQUIRED",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Check if email is already taken by another user
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from("salon_users")
      .select("id")
      .ilike("email", email)
      .neq("id", userId)
      .limit(1)
      .single();

    if (existingUser) {
      return res.status(400).json({
        ok: false,
        error: "EMAIL_ALREADY_EXISTS",
      });
    }

    // Update user email
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("salon_users")
      .update({
        email: email.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select(`
        id,
        email,
        role,
        is_active,
        created_at,
        updated_at
      `)
      .single();

    if (updateError) {
      console.error("updateProfile error:", updateError);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_FAILED",
        details: updateError.message,
      });
    }

    return res.json({
      ok: true,
      user: updatedUser,
      message: "Profile updated successfully"
    });

  } catch (err) {
    console.error("updateProfile fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

/**
 * PATCH /api/owner/profile/password
 * Change owner's password
 */
async function changePassword(req, res) {
  try {
    const { id: userId } = req.ownerUser;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        ok: false,
        error: "CURRENT_AND_NEW_PASSWORD_REQUIRED",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "PASSWORD_TOO_SHORT",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Get current user with password hash
    const { data: user, error: userError } = await supabaseAdmin
      .from("salon_users")
      .select("id, password_hash")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        ok: false,
        error: "USER_NOT_FOUND",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword, 
      user.password_hash || ""
    );

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_CURRENT_PASSWORD",
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await supabaseAdmin
      .from("salon_users")
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (updateError) {
      console.error("changePassword error:", updateError);
      return res.status(500).json({
        ok: false,
        error: "PASSWORD_UPDATE_FAILED",
        details: updateError.message,
      });
    }

    return res.json({
      ok: true,
      message: "Password changed successfully"
    });

  } catch (err) {
    console.error("changePassword fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
};