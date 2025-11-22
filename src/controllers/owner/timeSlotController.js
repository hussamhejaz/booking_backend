const { supabaseAdmin } = require("../../supabase");

function isValidTime(value) {
  if (!value) return false;
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function normalizeSlotInput(slot) {
  return {
    slot_time: slot.slot_time,
    duration_minutes:
      slot.duration_minutes !== undefined ? parseInt(slot.duration_minutes, 10) : 30,
    is_active: slot.is_active !== undefined ? Boolean(slot.is_active) : true,
  };
}

function groupSlotsByDay(slots = []) {
  return slots.reduce((acc, slot) => {
    if (!acc[slot.day_of_week]) {
      acc[slot.day_of_week] = [];
    }
    acc[slot.day_of_week].push(slot);
    return acc;
  }, {});
}

async function listTimeSlots(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { day } = req.query;

    if (!salonId) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    let query = supabaseAdmin
      .from("salon_time_slots")
      .select("id, day_of_week, slot_time, duration_minutes, is_active")
      .eq("salon_id", salonId)
      .order("day_of_week", { ascending: true })
      .order("slot_time", { ascending: true });

    if (day !== undefined) {
      const dayInt = parseInt(day, 10);
      if (Number.isNaN(dayInt) || dayInt < 0 || dayInt > 6) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_DAY",
        });
      }
      query = query.eq("day_of_week", dayInt);
    }

    const { data, error } = await query;

    if (error) {
      console.error("listTimeSlots error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_TIME_SLOTS_FAILED",
      });
    }

    return res.json({
      ok: true,
      slots: groupSlotsByDay(data),
      raw: data,
    });
  } catch (err) {
    console.error("listTimeSlots fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

async function upsertTimeSlots(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { day_of_week, slots } = req.body || {};

    if (!salonId) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const dayInt = parseInt(day_of_week, 10);
    if (Number.isNaN(dayInt) || dayInt < 0 || dayInt > 6) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DAY",
        details: "day_of_week must be between 0 (Sunday) and 6 (Saturday)",
      });
    }

    if (!Array.isArray(slots)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_SLOTS",
        details: "slots must be an array of { slot_time, duration_minutes?, is_active? }",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const cleanedSlots = [];
    const seenTimes = new Set();

    for (const slot of slots) {
      if (!slot || !slot.slot_time) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SLOT",
          details: "slot_time is required for each slot",
        });
      }

      if (!isValidTime(slot.slot_time)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SLOT_TIME",
          details: `Invalid time format: ${slot.slot_time}`,
        });
      }

      if (seenTimes.has(slot.slot_time)) {
        return res.status(400).json({
          ok: false,
          error: "DUPLICATE_SLOT_TIME",
          details: `Duplicate slot_time: ${slot.slot_time}`,
        });
      }

      seenTimes.add(slot.slot_time);

      const normalized = normalizeSlotInput(slot);
      if (normalized.duration_minutes <= 0) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_DURATION",
          details: "duration_minutes must be greater than 0",
        });
      }

      cleanedSlots.push({
        salon_id: salonId,
        day_of_week: dayInt,
        slot_time: normalized.slot_time,
        duration_minutes: normalized.duration_minutes,
        is_active: normalized.is_active,
      });
    }

    // Replace existing slots for the day
    const { error: deleteError } = await supabaseAdmin
      .from("salon_time_slots")
      .delete()
      .eq("salon_id", salonId)
      .eq("day_of_week", dayInt);

    if (deleteError) {
      console.error("upsertTimeSlots delete error:", deleteError);
      return res.status(500).json({
        ok: false,
        error: "DELETE_TIME_SLOTS_FAILED",
      });
    }

    let inserted = [];
    if (cleanedSlots.length) {
      const { data, error } = await supabaseAdmin
        .from("salon_time_slots")
        .insert(cleanedSlots)
        .select("id, day_of_week, slot_time, duration_minutes, is_active")
        .order("slot_time", { ascending: true });

      if (error) {
        console.error("upsertTimeSlots insert error:", error);
        return res.status(500).json({
          ok: false,
          error: "UPSERT_TIME_SLOTS_FAILED",
          details: error.message,
        });
      }

      inserted = data;
    }

    return res.json({
      ok: true,
      day_of_week: dayInt,
      slots: inserted,
      message: cleanedSlots.length
        ? "Time slots saved"
        : "All manual slots removed for this day",
    });
  } catch (err) {
    console.error("upsertTimeSlots fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message,
    });
  }
}

async function deleteTimeSlot(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { slotId } = req.params;

    if (!salonId) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    if (!slotId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SLOT_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { error } = await supabaseAdmin
      .from("salon_time_slots")
      .delete()
      .eq("id", slotId)
      .eq("salon_id", salonId);

    if (error) {
      console.error("deleteTimeSlot error:", error);
      return res.status(500).json({
        ok: false,
        error: "DELETE_TIME_SLOT_FAILED",
      });
    }

    return res.json({
      ok: true,
      slotId,
      message: "Time slot deleted",
    });
  } catch (err) {
    console.error("deleteTimeSlot fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listTimeSlots,
  upsertTimeSlots,
  deleteTimeSlot,
};
