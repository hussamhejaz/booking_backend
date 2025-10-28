// src/controllers/superadmin/statsController.js
const { supabaseAdmin } = require("../../supabase");

// GET /api/superadmin/stats
// Returns high-level dashboard metrics for super admin
async function getPlatformStats(req, res) {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // total salons
    const { count: totalSalons, error: totalErr } = await supabaseAdmin
      .from("salons")
      .select("id", { count: "exact", head: true });

    if (totalErr) {
      console.error("stats totalSalons error:", totalErr);
    }

    // active salons
    const { count: activeSalons, error: activeErr } = await supabaseAdmin
      .from("salons")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (activeErr) {
      console.error("stats activeSalons error:", activeErr);
    }

    // premium salons
    const { count: premiumSalons, error: premiumErr } = await supabaseAdmin
      .from("salons")
      .select("id", { count: "exact", head: true })
      .eq("plan_type", "premium");

    if (premiumErr) {
      console.error("stats premiumSalons error:", premiumErr);
    }

    // NOTE:
    // bookings / revenue / complaints tables not built yet.
    // We'll just return placeholder zeros so frontend can render.
    const activeBookings = 0;
    const monthlyRevenueSAR = 0;
    const openComplaints = 0;

    return res.json({
      ok: true,
      stats: {
        totalSalons: totalSalons ?? 0,
        activeSalons: activeSalons ?? 0,
        premiumSalons: premiumSalons ?? 0,
        activeBookings,
        monthlyRevenueSAR: monthlyRevenueSAR,
        openComplaints,
      },
    });
  } catch (err) {
    console.error("getPlatformStats fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = { getPlatformStats };
