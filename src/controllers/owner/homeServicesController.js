// src/controllers/owner/homeServicesController.js
const { supabaseAdmin } = require("../../supabase");
const {
  replaceHomeServiceSlots,
  fetchHomeServiceSlots,
} = require("./homeServiceSlotController");

function need(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

// Helper function to get valid categories for a salon
async function getValidCategories(salonId) {
  if (!supabaseAdmin) return [];

  try {
    // Get custom categories
    const { data: customCategories } = await supabaseAdmin
      .from("salon_categories")
      .select("value, label, icon")
      .eq("salon_id", salonId);

    // Default categories
    const defaultCategories = [
      { value: "scissors", label: "Hair Services", icon: "scissors" },
      { value: "nails", label: "Nail Care", icon: "nails" },
      { value: "makeup", label: "Makeup", icon: "makeup" },
      { value: "spa", label: "Spa Treatments", icon: "spa" },
      { value: "star", label: "Premium Services", icon: "star" },
      { value: "facial", label: "Facial Care", icon: "facial" },
      { value: "massage", label: "Massage", icon: "massage" },
      { value: "waxing", label: "Waxing", icon: "waxing" }
    ];

    return [...defaultCategories, ...(customCategories || [])];
  } catch (error) {
    console.error("getValidCategories error:", error);
    return [];
  }
}

// GET /api/owner/home-services
async function listHomeServices(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("home_services")
      .select(
        `
        id,
        salon_id,
        name,
        description,
        price,
        duration_minutes,
        category,
        is_active,
        created_at,
        updated_at
      `
      )
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listHomeServices error:", error);
      return res.status(500).json({
        ok: false,
        error: "LIST_HOME_SERVICES_FAILED",
        details: error.message,
      });
    }

    // Get categories for mapping
    const categories = await getValidCategories(salonId);

    // Map category values to full category objects
    const servicesWithCategories = data.map(service => ({
      ...service,
      category_data: categories.find(cat => cat.value === service.category) || null
    }));

    return res.json({
      ok: true,
      services: servicesWithCategories || [],
      categories: categories // Also return available categories
    });
  } catch (err) {
    console.error("listHomeServices fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/home-services/:serviceId
async function getHomeServiceById(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { serviceId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("home_services")
      .select(
        `
        id,
        salon_id,
        name,
        description,
        price,
        duration_minutes,
        category,
        is_active,
        created_at,
        updated_at
      `
      )
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .single();

    if (error || !data) {
      console.error("getHomeServiceById error:", error);
      return res.status(404).json({
        ok: false,
        error: "HOME_SERVICE_NOT_FOUND",
      });
    }

    // Get categories for mapping
    const categories = await getValidCategories(salonId);
    let timeSlots = [];
    try {
      timeSlots = await fetchHomeServiceSlots(serviceId);
    } catch (slotErr) {
      console.error("getHomeServiceById slots error:", slotErr);
    }

    return res.json({
      ok: true,
      service: {
        ...data,
        category_data: categories.find(cat => cat.value === data.category) || null,
        time_slots: timeSlots,
      },
      categories: categories
    });
  } catch (err) {
    console.error("getHomeServiceById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/home-services
async function createHomeService(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    // required
    need(req.body, "name");

    const {
      name,
      description,
      price,
      duration_minutes,
      category,
      is_active,
      slots,
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Validate category if provided
    if (category) {
      const validCategories = await getValidCategories(salonId);
      const categoryExists = validCategories.some(cat => cat.value === category);
      
      if (!categoryExists) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_CATEGORY",
          details: "The selected category is not valid"
        });
      }
    }

    const insertPayload = {
      salon_id: salonId,
      name: name.trim(),
      description: description?.trim() || null,
      price: price === undefined || price === null ? null : price,
      duration_minutes:
        duration_minutes === undefined || duration_minutes === null
          ? null
          : duration_minutes,
      category: category || null,
      is_active:
        typeof is_active === "boolean" ? is_active : true,
    };

    const { data, error } = await supabaseAdmin
      .from("home_services")
      .insert([insertPayload])
      .select(
        `
        id,
        salon_id,
        name,
        description,
        price,
        duration_minutes,
        category,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      console.error("createHomeService error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_HOME_SERVICE_FAILED",
        details: error.message,
      });
    }

    let timeSlots = [];
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SLOTS",
          details: "Slots must be an array",
        });
      }
      try {
        timeSlots = await replaceHomeServiceSlots(data.id, slots);
      } catch (slotErr) {
        console.error("createHomeService slots error:", slotErr);
        return res.status(400).json({
          ok: false,
          error: "HOME_SERVICE_SLOTS_FAILED",
          details: slotErr.message,
        });
      }
    } else {
      timeSlots = await fetchHomeServiceSlots(data.id);
    }

    // Get categories for response
    const categories = await getValidCategories(salonId);

    return res.status(201).json({
      ok: true,
      service: {
        ...data,
        category_data: categories.find(cat => cat.value === data.category) || null,
        time_slots: timeSlots,
      },
    });
  } catch (err) {
    console.error("createHomeService fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// PATCH /api/owner/home-services/:serviceId
async function updateHomeService(req, res) {
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
      category,
      is_active,
      slots,
    } = req.body;

    // Validate category if provided
    if (category !== undefined) {
      if (category) {
        const validCategories = await getValidCategories(salonId);
        const categoryExists = validCategories.some(cat => cat.value === category);
        
        if (!categoryExists) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_CATEGORY",
            details: "The selected category is not valid"
          });
        }
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined)
      updates.description =
        description && description.trim() !== "" ? description.trim() : null;
    if (price !== undefined) updates.price = price;
    if (duration_minutes !== undefined)
      updates.duration_minutes = duration_minutes;
    if (category !== undefined) updates.category = category;
    if (is_active !== undefined) updates.is_active = is_active;

    updates.updated_at = new Date().toISOString();

    if (
      Object.keys(updates).length === 1 && // only updated_at
      Object.prototype.hasOwnProperty.call(updates, "updated_at")
    ) {
      return res.status(400).json({
        ok: false,
        error: "NO_VALID_FIELDS",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("home_services")
      .update(updates)
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .select(
        `
        id,
        salon_id,
        name,
        description,
        price,
        duration_minutes,
        category,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      console.error("updateHomeService error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_HOME_SERVICE_FAILED",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        ok: false,
        error: "HOME_SERVICE_NOT_FOUND",
      });
    }

    let timeSlots = [];
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SLOTS",
        });
      }
      try {
        timeSlots = await replaceHomeServiceSlots(serviceId, slots);
      } catch (slotErr) {
        console.error("updateHomeService slots error:", slotErr);
        return res.status(400).json({
          ok: false,
          error: "HOME_SERVICE_SLOTS_FAILED",
          details: slotErr.message,
        });
      }
    } else {
      try {
        timeSlots = await fetchHomeServiceSlots(serviceId);
      } catch (slotErr) {
        console.error("updateHomeService fetch slots error:", slotErr);
      }
    }

    // Get categories for response
    const categories = await getValidCategories(salonId);

    return res.json({
      ok: true,
      service: {
        ...data,
        category_data: categories.find(cat => cat.value === data.category) || null,
        time_slots: timeSlots,
      },
    });
  } catch (err) {
    console.error("updateHomeService fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// DELETE /api/owner/home-services/:serviceId
async function deleteHomeService(req, res) {
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

    // Make sure it's yours before deleting
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("home_services")
      .select("id, salon_id, name")
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({
        ok: false,
        error: "HOME_SERVICE_NOT_FOUND",
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from("home_services")
      .delete()
      .eq("id", serviceId)
      .eq("salon_id", salonId);

    if (delErr) {
      console.error("deleteHomeService error:", delErr);
      return res.status(500).json({
        ok: false,
        error: "DELETE_HOME_SERVICE_FAILED",
        details: delErr.message,
      });
    }

    return res.json({
      ok: true,
      deletedServiceId: serviceId,
      deletedName: existing.name,
    });
  } catch (err) {
    console.error("deleteHomeService fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/home-services/categories/available
// Get available categories for home services
async function getAvailableCategories(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    
    const categories = await getValidCategories(salonId);
    
    return res.json({
      ok: true,
      categories: categories,
    });
  } catch (err) {
    console.error("getAvailableCategories fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listHomeServices,
  getHomeServiceById,
  createHomeService,
  updateHomeService,
  deleteHomeService,
  getAvailableCategories,
};
