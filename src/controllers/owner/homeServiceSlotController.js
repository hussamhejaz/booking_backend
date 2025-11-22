const { supabaseAdmin } = require("../../supabase");

function isValidTime(value) {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(value || "");
}

async function ensureHomeServiceOwnership(homeServiceId, salonId) {
  const { data, error } = await supabaseAdmin
    .from("home_services")
    .select("id")
    .eq("id", homeServiceId)
    .eq("salon_id", salonId)
    .single();

  if (error || !data) {
    return { ok: false };
  }

  return { ok: true };
}

function normalizeSlots(slots) {
  if (!Array.isArray(slots)) {
    throw new Error("SLOTS_MUST_BE_ARRAY");
  }

  const seen = new Set();
  return slots.map((slot) => {
    if (!slot || !slot.slot_time) {
      throw new Error("INVALID_SLOT_TIME");
    }
    if (!isValidTime(slot.slot_time)) {
      throw new Error(`INVALID_SLOT_FORMAT:${slot.slot_time}`);
    }
    if (seen.has(slot.slot_time)) {
      throw new Error(`DUPLICATE_SLOT:${slot.slot_time}`);
    }
    seen.add(slot.slot_time);

    const duration =
      slot.duration_minutes !== undefined
        ? parseInt(slot.duration_minutes, 10)
        : 30;

    if (!duration || duration <= 0) {
      throw new Error(`INVALID_DURATION:${slot.slot_time}`);
    }

    return {
      slot_time: slot.slot_time,
      duration_minutes: duration,
      is_active: slot.is_active !== undefined ? Boolean(slot.is_active) : true,
    };
  });
}

async function replaceHomeServiceSlots(homeServiceId, slots = []) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const cleanedSlots = normalizeSlots(slots).map((slot) => ({
    home_service_id: homeServiceId,
    ...slot,
  }));

  const { error: deleteError } = await supabaseAdmin
    .from("home_service_time_slots")
    .delete()
    .eq("home_service_id", homeServiceId);

  if (deleteError) {
    throw new Error("DELETE_HOME_SERVICE_SLOTS_FAILED");
  }

  let inserted = [];
  if (cleanedSlots.length) {
    const { data, error } = await supabaseAdmin
      .from("home_service_time_slots")
      .insert(cleanedSlots)
      .select("id, slot_time, duration_minutes, is_active")
      .order("slot_time", { ascending: true });

    if (error) {
      throw new Error(error.message || "INSERT_HOME_SERVICE_SLOTS_FAILED");
    }

    inserted = data;
  }

  return inserted;
}

async function fetchHomeServiceSlots(homeServiceId) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const { data, error } = await supabaseAdmin
    .from("home_service_time_slots")
    .select("id, slot_time, duration_minutes, is_active")
    .eq("home_service_id", homeServiceId)
    .order("slot_time", { ascending: true });

  if (error) {
    throw new Error(error.message || "FETCH_HOME_SERVICE_SLOTS_FAILED");
  }

  return data || [];
}

async function listHomeServiceSlots(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { serviceId } = req.params;

    if (!salonId) {
      return res.status(401).json({ ok: false, error: "AUTHENTICATION_REQUIRED" });
    }

    if (!serviceId) {
      return res.status(400).json({ ok: false, error: "MISSING_SERVICE_ID" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" });
    }

    const ownership = await ensureHomeServiceOwnership(serviceId, salonId);
    if (!ownership.ok) {
      return res.status(404).json({ ok: false, error: "HOME_SERVICE_NOT_FOUND" });
    }

    const slots = await fetchHomeServiceSlots(serviceId);

    return res.json({
      ok: true,
      home_service_id: serviceId,
      slots,
    });
  } catch (err) {
    console.error("listHomeServiceSlots fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message,
    });
  }
}

async function upsertHomeServiceSlots(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { serviceId } = req.params;
    const { slots = [] } = req.body || {};

    if (!salonId) {
      return res.status(401).json({ ok: false, error: "AUTHENTICATION_REQUIRED" });
    }

    if (!serviceId) {
      return res.status(400).json({ ok: false, error: "MISSING_SERVICE_ID" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" });
    }

    const ownership = await ensureHomeServiceOwnership(serviceId, salonId);
    if (!ownership.ok) {
      return res.status(404).json({ ok: false, error: "HOME_SERVICE_NOT_FOUND" });
    }

    let inserted = [];
    if (Array.isArray(slots) && slots.length) {
      inserted = await replaceHomeServiceSlots(serviceId, slots);
    } else {
      await replaceHomeServiceSlots(serviceId, []);
    }

    return res.json({
      ok: true,
      home_service_id: serviceId,
      slots: inserted,
      message: slots.length
        ? "Home service slots saved"
        : "All slots removed for this home service",
    });
  } catch (err) {
    console.error("upsertHomeServiceSlots fatal:", err);
    const status =
      err.message && err.message.startsWith("INVALID")
        ? 400
        : 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
    });
  }
}

async function deleteHomeServiceSlot(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { serviceId, slotId } = req.params;

    if (!salonId) {
      return res.status(401).json({ ok: false, error: "AUTHENTICATION_REQUIRED" });
    }

    if (!serviceId || !slotId) {
      return res.status(400).json({ ok: false, error: "MISSING_PARAMETERS" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "SUPABASE_NOT_CONFIGURED" });
    }

    const ownership = await ensureHomeServiceOwnership(serviceId, salonId);
    if (!ownership.ok) {
      return res.status(404).json({ ok: false, error: "HOME_SERVICE_NOT_FOUND" });
    }

    const { error } = await supabaseAdmin
      .from("home_service_time_slots")
      .delete()
      .eq("id", slotId)
      .eq("home_service_id", serviceId);

    if (error) {
      console.error("deleteHomeServiceSlot error:", error);
      return res.status(500).json({
        ok: false,
        error: "DELETE_HOME_SERVICE_SLOT_FAILED",
      });
    }

    return res.json({
      ok: true,
      slotId,
      home_service_id: serviceId,
      message: "Slot deleted",
    });
  } catch (err) {
    console.error("deleteHomeServiceSlot fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listHomeServiceSlots,
  upsertHomeServiceSlots,
  deleteHomeServiceSlot,
  replaceHomeServiceSlots,
  fetchHomeServiceSlots,
};
