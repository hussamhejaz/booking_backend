const { supabaseAdmin } = require("../../supabase");

// Helper to validate required fields
function validateRequiredFields(body, fields) {
  const missing = fields.filter(field => !body.hasOwnProperty(field));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

// Helper function to convert time string to minutes since midnight
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  
  const timeParts = timeStr.split(':');
  const hours = parseInt(timeParts[0]) || 0;
  const minutes = parseInt(timeParts[1]) || 0;
  
  return hours * 60 + minutes;
}

// Helper function to validate time format
function isValidTime(timeStr) {
  if (!timeStr) return false;
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
  return timeRegex.test(timeStr);
}

// GET /api/owner/working-hours
// Get working hours for the logged-in owner's salon
async function getWorkingHours(req, res) {
  try {
    // Check if ownerUser is defined (authentication middleware should set this)
    if (!req.ownerUser || !req.ownerUser.salon_id) {
      console.error('❌ [OWNER] Authentication failed: req.ownerUser is undefined');
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
        details: "Owner authentication is required"
      });
    }

    const { salon_id } = req.ownerUser;

    console.log('🔍 [OWNER] Fetching working hours for salon:', salon_id);

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("working_hours")
      .select("*")
      .eq("salon_id", salon_id)
      .order("day_of_week", { ascending: true });

    if (error) {
      console.error("❌ [OWNER] getWorkingHours error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_HOURS_FAILED",
        details: error.message,
      });
    }

    // If no working hours found, initialize default ones
    if (!data || data.length === 0) {
      console.log('⚠️ [OWNER] No working hours found, initializing defaults');
      const initialized = await initializeDefaultWorkingHours(salon_id);
      
      if (initialized) {
        // Fetch the newly created default hours
        const { data: defaultData } = await supabaseAdmin
          .from("working_hours")
          .select("*")
          .eq("salon_id", salon_id)
          .order("day_of_week", { ascending: true });
          
        return res.json({
          ok: true,
          workingHours: defaultData || [],
          timezone: "Asia/Riyadh",
          note: "Default working hours initialized"
        });
      }
    }

    console.log('✅ [OWNER] Found working hours:', data?.length);

    return res.json({
      ok: true,
      workingHours: data || [],
      timezone: "Asia/Riyadh"
    });
  } catch (err) {
    console.error("❌ [OWNER] getWorkingHours fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message
    });
  }
}

// PUT /api/owner/working-hours
// Update working hours for the salon
async function updateWorkingHours(req, res) {
  try {
    // Check if ownerUser is defined (authentication middleware should set this)
    if (!req.ownerUser || !req.ownerUser.salon_id) {
      console.error('❌ [OWNER] Authentication failed: req.ownerUser is undefined');
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
        details: "Owner authentication is required"
      });
    }

    const { salon_id } = req.ownerUser;
    const { workingHours, timezone } = req.body;

    console.log('🔄 [OWNER] Update working hours request:', { 
      salon_id, 
      workingHoursCount: workingHours?.length,
      timezone 
    });

    // Validate request body
    if (!workingHours || !Array.isArray(workingHours)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_WORKING_HOURS_DATA",
        details: "Working hours data must be an array"
      });
    }

    if (workingHours.length !== 7) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_WORKING_HOURS_COUNT",
        details: "Working hours must include all 7 days of the week"
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Validate each day's data with comprehensive error handling
    const validationErrors = [];
    const daysSet = new Set();

    for (const [index, day] of workingHours.entries()) {
      // Check for duplicate days
      if (daysSet.has(day.day_of_week)) {
        validationErrors.push(`Duplicate day_of_week: ${day.day_of_week}`);
      }
      daysSet.add(day.day_of_week);

      // Check required fields
      if (day.day_of_week === undefined || day.day_of_week === null) {
        validationErrors.push(`Missing day_of_week at index ${index}`);
        continue;
      }

      if (day.day_of_week < 0 || day.day_of_week > 6) {
        validationErrors.push(`Invalid day_of_week: ${day.day_of_week} at index ${index}. Must be between 0-6`);
        continue;
      }

      if (day.is_closed === undefined || day.is_closed === null) {
        validationErrors.push(`Missing is_closed for day ${day.day_of_week}`);
        continue;
      }

      // Only validate times if the day is not closed
      if (!day.is_closed) {
        if (!day.open_time) {
          validationErrors.push(`Missing open_time for day ${day.day_of_week}`);
        } else if (!isValidTime(day.open_time)) {
          validationErrors.push(`Invalid open_time format for day ${day.day_of_week}: ${day.open_time}`);
        }

        if (!day.close_time) {
          validationErrors.push(`Missing close_time for day ${day.day_of_week}`);
        } else if (!isValidTime(day.close_time)) {
          validationErrors.push(`Invalid close_time format for day ${day.day_of_week}: ${day.close_time}`);
        }

        // Validate time range if both times are present and valid
        if (day.open_time && day.close_time && isValidTime(day.open_time) && isValidTime(day.close_time)) {
          const openMinutes = timeToMinutes(day.open_time);
          const closeMinutes = timeToMinutes(day.close_time);

          if (openMinutes >= closeMinutes) {
            validationErrors.push(`Close time must be after open time for day ${day.day_of_week}`);
          }
        }
      } else {
        // For closed days, ensure times are null
        if (day.open_time !== null || day.close_time !== null) {
          console.warn(`⚠️ [OWNER] Closed day ${day.day_of_week} has non-null times, will set to null`);
        }
      }
    }

    // Check if all days are present (0-6)
    for (let i = 0; i < 7; i++) {
      if (!daysSet.has(i)) {
        validationErrors.push(`Missing day_of_week: ${i}`);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_FAILED",
        details: validationErrors
      });
    }

    // Prepare updates - ensure proper null values for closed days
    const updates = workingHours.map(day => ({
      salon_id,
      day_of_week: day.day_of_week,
      is_closed: Boolean(day.is_closed),
      open_time: day.is_closed ? null : day.open_time,
      close_time: day.is_closed ? null : day.close_time,
      break_start: day.is_closed ? null : (day.break_start || null),
      break_end: day.is_closed ? null : (day.break_end || null),
      updated_at: new Date().toISOString()
    }));

    console.log('📝 [OWNER] Prepared updates for days:', updates.map(d => d.day_of_week));

    // Use upsert instead of delete+insert for better performance and atomicity
    const { data: updatedHours, error: upsertError } = await supabaseAdmin
      .from("working_hours")
      .upsert(updates, {
        onConflict: 'salon_id,day_of_week',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      console.error("❌ [OWNER] Upsert working hours error:", upsertError);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_HOURS_FAILED",
        details: upsertError.message,
      });
    }

    console.log('✅ [OWNER] Working hours updated successfully');

    return res.json({
      ok: true,
      message: "Working hours updated successfully",
      workingHours: updatedHours,
      timezone: timezone || "Asia/Riyadh"
    });
  } catch (err) {
    console.error("❌ [OWNER] updateWorkingHours fatal error:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message,
    });
  }
}

// POST /api/owner/working-hours/reset
// Reset working hours to default values
async function resetWorkingHours(req, res) {
  try {
    // Check if ownerUser is defined (authentication middleware should set this)
    if (!req.ownerUser || !req.ownerUser.salon_id) {
      console.error('❌ [OWNER] Authentication failed: req.ownerUser is undefined');
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
        details: "Owner authentication is required"
      });
    }

    const { salon_id } = req.ownerUser;

    console.log('🔄 [OWNER] Resetting working hours for salon:', salon_id);

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const initialized = await initializeDefaultWorkingHours(salon_id);
    
    if (!initialized) {
      return res.status(500).json({
        ok: false,
        error: "RESET_FAILED",
        details: "Failed to reset working hours to default"
      });
    }

    // Fetch the newly created default hours
    const { data: defaultHours, error: fetchError } = await supabaseAdmin
      .from("working_hours")
      .select("*")
      .eq("salon_id", salon_id)
      .order("day_of_week", { ascending: true });

    if (fetchError) {
      console.error("❌ [OWNER] Fetch after reset error:", fetchError);
    }

    return res.json({
      ok: true,
      message: "Working hours reset to default successfully",
      workingHours: defaultHours || []
    });
  } catch (err) {
    console.error("❌ [OWNER] resetWorkingHours fatal error:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message,
    });
  }
}

// Helper function to initialize default working hours for a new salon
async function initializeDefaultWorkingHours(salonId) {
  try {
    const defaultHours = [
      { day_of_week: 0, is_closed: false, open_time: "09:00", close_time: "18:00", break_start: "13:00", break_end: "14:00" }, // Sunday
      { day_of_week: 1, is_closed: false, open_time: "09:00", close_time: "18:00", break_start: "13:00", break_end: "14:00" }, // Monday
      { day_of_week: 2, is_closed: false, open_time: "09:00", close_time: "18:00", break_start: "13:00", break_end: "14:00" }, // Tuesday
      { day_of_week: 3, is_closed: false, open_time: "09:00", close_time: "18:00", break_start: "13:00", break_end: "14:00" }, // Wednesday
      { day_of_week: 4, is_closed: false, open_time: "09:00", close_time: "18:00", break_start: "13:00", break_end: "14:00" }, // Thursday
      { day_of_week: 5, is_closed: true, open_time: null, close_time: null, break_start: null, break_end: null }, // Friday
      { day_of_week: 6, is_closed: false, open_time: "10:00", close_time: "16:00", break_start: "13:00", break_end: "14:00" }, // Saturday
    ];

    const records = defaultHours.map(day => ({
      salon_id: salonId,
      ...day
    }));

    const { error } = await supabaseAdmin
      .from("working_hours")
      .upsert(records, {
        onConflict: 'salon_id,day_of_week'
      });

    if (error) {
      console.error("❌ Failed to initialize default working hours:", error);
      return false;
    }

    console.log('✅ Default working hours initialized for salon:', salonId);
    return true;
  } catch (err) {
    console.error("❌ initializeDefaultWorkingHours error:", err);
    return false;
  }
}

module.exports = {
  getWorkingHours,
  updateWorkingHours,
  resetWorkingHours,
  initializeDefaultWorkingHours
};