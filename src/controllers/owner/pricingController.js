const { supabaseAdmin } = require("../../supabase");
const {
  replaceServiceSlots,
  fetchServiceSlots,
} = require("./serviceSlotController");

// Helper function
function need(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

// GET /api/owner/sections/:sectionId/services
// Get all services for a specific section
async function getSectionServices(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { sectionId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Verify section belongs to salon
    const { data: section, error: sectionError } = await supabaseAdmin
      .from("sections")
      .select("id")
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    // Get services with their features
    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select(`
        *,
        service_features (*)
      `)
      .eq("section_id", sectionId)
      .eq("salon_id", salonId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (servicesError) {
      console.error("getSectionServices error:", servicesError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SERVICES_FAILED",
        details: servicesError.message,
      });
    }

    return res.json({
      ok: true,
      services: services || [],
    });
  } catch (err) {
    console.error("getSectionServices fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/services/:serviceId
// Get single service by ID
async function getServiceById(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { serviceId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: service, error } = await supabaseAdmin
      .from("services")
      .select(`
        *,
        service_features (*),
        sections (id, name)
      `)
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .single();

    if (error || !service) {
      console.error("getServiceById error:", error);
      return res.status(404).json({
        ok: false,
        error: "SERVICE_NOT_FOUND",
      });
    }

    let timeSlots = [];
    try {
      timeSlots = await fetchServiceSlots(serviceId);
    } catch (slotErr) {
      console.error("getServiceById slots error:", slotErr);
    }

    return res.json({
      ok: true,
      service: {
        ...service,
        time_slots: timeSlots,
      },
    });
  } catch (err) {
    console.error("getServiceById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/sections/:sectionId/services
// Create a new service in a section
async function createService(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { sectionId } = req.params;

    need(req.body, "name");
    need(req.body, "price");

    const {
      name,
      description,
      price,
      duration_minutes = 30,
      is_active = true,
      display_order = 0,
      features = [],
      slots,
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Verify section belongs to salon
    const { data: section, error: sectionError } = await supabaseAdmin
      .from("sections")
      .select("id")
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    // Create service
    const { data: service, error: serviceError } = await supabaseAdmin
      .from("services")
      .insert([
        {
          salon_id: salonId,
          section_id: sectionId,
          name,
          description: description || null,
          price: parseFloat(price),
          duration_minutes: parseInt(duration_minutes),
          is_active,
          display_order: parseInt(display_order),
        },
      ])
      .select("*")
      .single();

    if (serviceError) {
      console.error("createService error:", serviceError);
      return res.status(500).json({
        ok: false,
        error: "CREATE_SERVICE_FAILED",
        details: serviceError.message,
      });
    }

    // Create features if provided
    if (Array.isArray(features) && features.length > 0) {
      const serviceFeatures = features.map((feature, index) => ({
        service_id: service.id,
        name: feature.name,
        is_checked: feature.is_checked || false,
        display_order: index,
      }));

      const { error: featuresError } = await supabaseAdmin
        .from("service_features")
        .insert(serviceFeatures);

      if (featuresError) {
        console.error("createService features error:", featuresError);
        // Continue anyway - features are optional
      }
    }

    let timeSlots = [];
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SLOTS",
          details: "slots must be an array of { slot_time, duration_minutes? }",
        });
      }
      try {
        timeSlots = await replaceServiceSlots(salonId, service.id, slots);
      } catch (slotErr) {
        console.error("createService slots error:", slotErr);
        const msg = slotErr.message || "SERVICE_SLOTS_FAILED";
        return res.status(400).json({
          ok: false,
          error: "SERVICE_SLOTS_FAILED",
          details: msg,
        });
      }
    }

    // Get the complete service with features
    const { data: completeService } = await supabaseAdmin
      .from("services")
      .select(`
        *,
        service_features (*)
      `)
      .eq("id", service.id)
      .single();

    return res.status(201).json({
      ok: true,
      service: {
        ...completeService,
        time_slots: timeSlots,
      },
    });
  } catch (err) {
    console.error("createService fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// PATCH /api/owner/services/:serviceId
// Update a service
async function updateService(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { serviceId } = req.params;

    if (!serviceId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SERVICE_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const {
      name,
      description,
      price,
      duration_minutes,
      is_active,
      display_order,
      features,
      slots,
    } = req.body;

    // Verify service belongs to salon
    const { data: existingService, error: checkError } = await supabaseAdmin
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .single();

    if (checkError || !existingService) {
      return res.status(404).json({
        ok: false,
        error: "SERVICE_NOT_FOUND",
      });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = parseFloat(price);
    if (duration_minutes !== undefined) updates.duration_minutes = parseInt(duration_minutes);
    if (is_active !== undefined) updates.is_active = is_active;
    if (display_order !== undefined) updates.display_order = parseInt(display_order);
    updates.updated_at = new Date().toISOString();

    // Update service
    const { data: service, error: updateError } = await supabaseAdmin
      .from("services")
      .update(updates)
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .select("*")
      .single();

    if (updateError) {
      console.error("updateService error:", updateError);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_SERVICE_FAILED",
        details: updateError.message,
      });
    }

    // Update features if provided
    if (Array.isArray(features)) {
      // Delete existing features
      await supabaseAdmin
        .from("service_features")
        .delete()
        .eq("service_id", serviceId);

      // Insert new features
      if (features.length > 0) {
        const serviceFeatures = features.map((feature, index) => ({
          service_id: serviceId,
          name: feature.name,
          is_checked: feature.is_checked || false,
          display_order: index,
        }));

        const { error: featuresError } = await supabaseAdmin
          .from("service_features")
          .insert(serviceFeatures);

        if (featuresError) {
          console.error("updateService features error:", featuresError);
          // Continue anyway - features are optional
        }
      }
    }

    let timeSlots = null;
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SLOTS",
        });
      }
      try {
        timeSlots = await replaceServiceSlots(salonId, serviceId, slots);
      } catch (slotErr) {
        console.error("updateService slots error:", slotErr);
        const msg = slotErr.message || "SERVICE_SLOTS_FAILED";
        return res.status(400).json({
          ok: false,
          error: "SERVICE_SLOTS_FAILED",
          details: msg,
        });
      }
    } else {
      try {
        timeSlots = await fetchServiceSlots(serviceId);
      } catch (slotErr) {
        console.error("updateService fetch slots error:", slotErr);
        timeSlots = [];
      }
    }

    // Get the complete updated service
    const { data: completeService } = await supabaseAdmin
      .from("services")
      .select(`
        *,
        service_features (*)
      `)
      .eq("id", serviceId)
      .single();

    return res.json({
      ok: true,
      service: {
        ...completeService,
        time_slots: timeSlots,
      },
    });
  } catch (err) {
    console.error("updateService fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// DELETE /api/owner/services/:serviceId
// Delete a service
async function deleteService(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { serviceId } = req.params;

    if (!serviceId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SERVICE_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Verify service belongs to salon
    const { data: existingService, error: checkError } = await supabaseAdmin
      .from("services")
      .select("id, name")
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .single();

    if (checkError || !existingService) {
      return res.status(404).json({
        ok: false,
        error: "SERVICE_NOT_FOUND",
      });
    }

    // Delete service (features will be cascade deleted)
    const { error: deleteError } = await supabaseAdmin
      .from("services")
      .delete()
      .eq("id", serviceId)
      .eq("salon_id", salonId);

    if (deleteError) {
      console.error("deleteService error:", deleteError);
      return res.status(500).json({
        ok: false,
        error: "DELETE_SERVICE_FAILED",
        details: deleteError.message,
      });
    }

    return res.json({
      ok: true,
      deletedServiceId: serviceId,
      deletedName: existingService.name,
    });
  } catch (err) {
    console.error("deleteService fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/services
// Get all services for the salon (across all sections)
async function getAllSalonServices(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: services, error } = await supabaseAdmin
      .from("services")
      .select(`
        *,
        service_features (*),
        sections (id, name, icon_key)
      `)
      .eq("salon_id", salonId)
      .order("section_id", { ascending: true })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("getAllSalonServices error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SERVICES_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      services: services || [],
    });
  } catch (err) {
    console.error("getAllSalonServices fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  getSectionServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getAllSalonServices,
};
