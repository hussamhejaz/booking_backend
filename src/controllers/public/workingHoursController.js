const { supabasePublic } = require("../../supabase");

// GET /api/public/:salonId/working-hours
async function getPublicWorkingHours(req, res) {
  try {
    const { salonId } = req.params;

    console.log('🔍 [PUBLIC] Fetching working hours for salon:', salonId);

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    if (!supabasePublic) {
      return res.status(500).json({
        ok: false,
        error: "DATABASE_NOT_CONFIGURED",
        details: "Database connection is not available"
      });
    }

    // Verify the salon exists
    const { data: salon, error: salonError } = await supabasePublic
      .from("salons")
      .select("id, name, brand_color")
      .eq("id", salonId)
      .single();

    console.log('🔍 [PUBLIC] Salon query result:', { 
      salonFound: !!salon, 
      salonError: salonError?.message 
    });

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
        details: salonError?.message
      });
    }

    // Get working hours for this salon
    console.log('🔍 [PUBLIC] Querying working hours table...');
    const { data: workingHours, error: hoursError } = await supabasePublic
      .from("working_hours")
      .select("*")
      .eq("salon_id", salonId)
      .order("day_of_week", { ascending: true });

    console.log('🔍 [PUBLIC] Working hours query result:', { 
      hoursCount: workingHours?.length || 0,
      hoursError: hoursError?.message
    });

    if (hoursError) {
      console.error("❌ [PUBLIC] Working hours query error:", hoursError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_HOURS_FAILED",
        details: hoursError.message,
      });
    }

    // Check if working hours exist
    if (!workingHours || workingHours.length === 0) {
      console.log('⚠️ [PUBLIC] No working hours found for salon');
      return res.json({
        ok: true,
        salon: {
          id: salon.id,
          name: salon.name,
          brand_color: salon.brand_color,
          timezone: "Asia/Riyadh"
        },
        workingHours: [],
        note: "No working hours configured for this salon"
      });
    }

    // Format the response
    const formattedHours = workingHours.map(day => ({
      day_of_week: day.day_of_week,
      is_closed: day.is_closed,
      open_time: day.open_time,
      close_time: day.close_time
    }));

    console.log('✅ [PUBLIC] Successfully returning working hours:', formattedHours.length);

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color,
        timezone: "Asia/Riyadh"
      },
      workingHours: formattedHours
    });
  } catch (err) {
    console.error("❌ [PUBLIC] Fatal error:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message
    });
  }
}

// Enhanced debug endpoint
async function debugSalonStatus(req, res) {
  try {
    const { salonId } = req.params;

    console.log('🔧 [DEBUG] Comprehensive debug for salon:', salonId);

    // 1. Check salon
    const { data: salon, error: salonError } = await supabasePublic
      .from("salons")
      .select("id, name, is_active, created_at, brand_color")
      .eq("id", salonId)
      .single();

    console.log('🔧 [DEBUG] Salon query:', { salon, salonError: salonError?.message });

    // 2. Check working hours
    const { data: workingHours, error: hoursError } = await supabasePublic
      .from("working_hours")
      .select("*")
      .eq("salon_id", salonId);

    console.log('🔧 [DEBUG] Working hours query:', { 
      hoursCount: workingHours?.length || 0,
      hoursError: hoursError?.message
    });

    if (salonError || !salon) {
      return res.json({
        ok: false,
        error: "SALON_NOT_FOUND",
        details: salonError?.message
      });
    }

    return res.json({
      ok: true,
      salon: salon,
      workingHours: {
        count: workingHours?.length || 0,
        data: workingHours || [],
        error: hoursError?.message
      },
      summary: {
        exists: true,
        active: salon.is_active,
        hasWorkingHours: (workingHours?.length || 0) > 0
      }
    });
  } catch (err) {
    console.error("🔧 [DEBUG] Fatal error:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message
    });
  }
}

module.exports = {
  getPublicWorkingHours,
  debugSalonStatus,
};