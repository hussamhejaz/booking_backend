const { supabaseAdmin } = require("../../supabase");

function isValidTime(value) {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(value || "");
}

async function ensureServiceOwnership(serviceId, salonId) {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id")
    .eq("id", serviceId)
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

async function replaceServiceSlots(salonId, serviceId, slots = []) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const cleanedSlots = normalizeSlots(slots).map((slot) => ({
    service_id: serviceId,
    ...slot,
  }));

  const { error: deleteError } = await supabaseAdmin
    .from("service_time_slots")
    .delete()
    .eq("service_id", serviceId);

  if (deleteError) {
    throw new Error("DELETE_SERVICE_SLOTS_FAILED");
  }

  let inserted = [];
  if (cleanedSlots.length) {
    const { data, error } = await supabaseAdmin
      .from("service_time_slots")
      .insert(cleanedSlots)
      .select("id, slot_time, duration_minutes, is_active")
      .order("slot_time", { ascending: true });

    if (error) {
      throw new Error(error.message || "INSERT_SERVICE_SLOTS_FAILED");
    }

    inserted = data;
  }

  return inserted;
}

async function fetchServiceSlots(serviceId) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const { data, error } = await supabaseAdmin
    .from("service_time_slots")
    .select("id, slot_time, duration_minutes, is_active")
    .eq("service_id", serviceId)
    .order("slot_time", { ascending: true });

  if (error) {
    throw new Error(error.message || "FETCH_SERVICE_SLOTS_FAILED");
  }

  return data || [];
}

async function listServiceTimeSlots(req, res) {
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

    const ownership = await ensureServiceOwnership(serviceId, salonId);
    if (!ownership.ok) {
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    }

    const slots = await fetchServiceSlots(serviceId);

    return res.json({
      ok: true,
      service_id: serviceId,
      slots,
    });
  } catch (err) {
    console.error("listServiceTimeSlots fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      details: err.message,
    });
  }
}

async function upsertServiceTimeSlots(req, res) {
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

    const ownership = await ensureServiceOwnership(serviceId, salonId);
    if (!ownership.ok) {
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    }

    let inserted = [];
    if (Array.isArray(slots) && slots.length) {
      inserted = await replaceServiceSlots(salonId, serviceId, slots);
    } else {
      await replaceServiceSlots(salonId, serviceId, []);
    }

    return res.json({
      ok: true,
      service_id: serviceId,
      slots: inserted,
      message: slots.length
        ? "Service slots saved"
        : "All service slots removed",
    });
  } catch (err) {
    console.error("upsertServiceTimeSlots fatal:", err);
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

async function deleteServiceTimeSlot(req, res) {
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

    const ownership = await ensureServiceOwnership(serviceId, salonId);
    if (!ownership.ok) {
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    }

    const { error } = await supabaseAdmin
      .from("service_time_slots")
      .delete()
      .eq("id", slotId)
      .eq("service_id", serviceId);

    if (error) {
      console.error("deleteServiceTimeSlot error:", error);
      return res.status(500).json({
        ok: false,
        error: "DELETE_SERVICE_SLOT_FAILED",
      });
    }

    return res.json({
      ok: true,
      slotId,
      service_id: serviceId,
      message: "Service slot deleted",
    });
  } catch (err) {
    console.error("deleteServiceTimeSlot fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listServiceTimeSlots,
  upsertServiceTimeSlots,
  deleteServiceTimeSlot,
  replaceServiceSlots,
  fetchServiceSlots,
};
