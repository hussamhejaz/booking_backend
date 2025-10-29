// src/controllers/owner/sectionsController.js
const { supabaseAdmin } = require("../../supabase");

// small helper
function need(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

// GET /api/owner/categories
// Get available service categories for the salon
async function getServiceCategories(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Get existing sections to extract used categories
    const { data: sections, error: sectionsError } = await supabaseAdmin
      .from("sections")
      .select("icon_key, name")
      .eq("salon_id", salonId);

    if (sectionsError) {
      console.error("getServiceCategories sections error:", sectionsError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SECTIONS_FAILED",
        details: sectionsError.message,
      });
    }

    // Get custom categories from the salon_categories table
    const { data: customCategories, error: categoriesError } = await supabaseAdmin
      .from("salon_categories")
      .select("value, label, icon")
      .eq("salon_id", salonId);

    if (categoriesError) {
      console.error("getServiceCategories categories error:", categoriesError);
      // If table doesn't exist yet, return default categories
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
      
      return res.json({
        ok: true,
        categories: defaultCategories,
      });
    }

    // Combine default and custom categories
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

    const allCategories = [...defaultCategories, ...(customCategories || [])];

    return res.json({
      ok: true,
      categories: allCategories,
    });
  } catch (err) {
    console.error("getServiceCategories fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/categories
// Add a new custom service category
async function addServiceCategory(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    need(req.body, "value");
    need(req.body, "label");
    need(req.body, "icon");

    const { value, label, icon } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Check if category already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("salon_categories")
      .select("value")
      .eq("salon_id", salonId)
      .eq("value", value)
      .single();

    if (existing) {
      return res.status(400).json({
        ok: false,
        error: "CATEGORY_ALREADY_EXISTS",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("salon_categories")
      .insert([
        {
          salon_id: salonId,
          value,
          label,
          icon,
          created_at: new Date().toISOString(),
        },
      ])
      .select("value, label, icon")
      .single();

    if (error) {
      console.error("addServiceCategory error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_CATEGORY_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      category: data,
    });
  } catch (err) {
    console.error("addServiceCategory fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// GET /api/owner/sections
// list all sections for the logged-in owner salon
async function listSections(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("sections")
      .select(
        `
        id,
        salon_id,
        name,
        subtitle,
        description,
        features,
        icon_key,
        is_active,
        created_at,
        updated_at
      `
      )
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listSections error:", error);
      return res.status(500).json({
        ok: false,
        error: "LIST_SECTIONS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      sections: data || [],
    });
  } catch (err) {
    console.error("listSections fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/sections/:sectionId
// fetch single section (for editing or preview)
async function getSectionById(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { sectionId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("sections")
      .select(
        `
        id,
        salon_id,
        name,
        subtitle,
        description,
        features,
        icon_key,
        is_active,
        created_at,
        updated_at
      `
      )
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .single();

    if (error) {
      console.error("getSectionById error:", error);
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      section: data,
    });
  } catch (err) {
    console.error("getSectionById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/sections
// create section for this salon
async function createSection(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    need(req.body, "name"); // required

    const {
      name,
      subtitle,
      description,
      features,
      icon_key,
      is_active,
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Validate icon_key exists in available categories
    const { data: categories } = await supabaseAdmin
      .from("salon_categories")
      .select("value")
      .eq("salon_id", salonId)
      .or(`value.eq.${icon_key},value.eq.scissors,value.eq.nails,value.eq.makeup,value.eq.spa,value.eq.star,value.eq.facial,value.eq.massage,value.eq.waxing`);

    const validIconKeys = ["scissors", "nails", "makeup", "spa", "star", "facial", "massage", "waxing"];
    const customIconKeys = categories?.map(cat => cat.value) || [];
    const allValidIconKeys = [...validIconKeys, ...customIconKeys];

    if (!allValidIconKeys.includes(icon_key)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_ICON_KEY",
        details: "The selected icon key is not valid",
      });
    }

    // normalize features
    const safeFeatures = Array.isArray(features) ? features : [];

    const { data, error } = await supabaseAdmin
      .from("sections")
      .insert([
        {
          salon_id: salonId,
          name,
          subtitle: subtitle || null,
          description: description || null,
          features: safeFeatures,
          icon_key: icon_key || "scissors",
          is_active: typeof is_active === "boolean" ? is_active : true,
        },
      ])
      .select(
        `
        id,
        salon_id,
        name,
        subtitle,
        description,
        features,
        icon_key,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      console.error("createSection error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_SECTION_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      section: data,
    });
  } catch (err) {
    console.error("createSection fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// PATCH /api/owner/sections/:sectionId
async function updateSection(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { sectionId } = req.params;

    if (!sectionId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SECTION_ID",
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
      subtitle,
      description,
      features,
      icon_key,
      is_active,
    } = req.body;

    // Validate icon_key if provided
    if (icon_key) {
      const { data: categories } = await supabaseAdmin
        .from("salon_categories")
        .select("value")
        .eq("salon_id", salonId)
        .or(`value.eq.${icon_key},value.eq.scissors,value.eq.nails,value.eq.makeup,value.eq.spa,value.eq.star,value.eq.facial,value.eq.massage,value.eq.waxing`);

      const validIconKeys = ["scissors", "nails", "makeup", "spa", "star", "facial", "massage", "waxing"];
      const customIconKeys = categories?.map(cat => cat.value) || [];
      const allValidIconKeys = [...validIconKeys, ...customIconKeys];

      if (!allValidIconKeys.includes(icon_key)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_ICON_KEY",
          details: "The selected icon key is not valid",
        });
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (description !== undefined) updates.description = description;
    if (features !== undefined)
      updates.features = Array.isArray(features) ? features : [];
    if (icon_key !== undefined) updates.icon_key = icon_key;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    if (
      Object.keys(updates).length === 1 &&
      Object.prototype.hasOwnProperty.call(updates, "updated_at")
    ) {
      return res.status(400).json({
        ok: false,
        error: "NO_VALID_FIELDS",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("sections")
      .update(updates)
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .select(
        `
        id,
        salon_id,
        name,
        subtitle,
        description,
        features,
        icon_key,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      console.error("updateSection error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_SECTION_FAILED",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      section: data,
    });
  } catch (err) {
    console.error("updateSection fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// DELETE /api/owner/sections/:sectionId
async function deleteSection(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { sectionId } = req.params;

    if (!sectionId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SECTION_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // confirm it's yours
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("sections")
      .select("id, salon_id, name")
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from("sections")
      .delete()
      .eq("id", sectionId)
      .eq("salon_id", salonId);

    if (delErr) {
      console.error("deleteSection error:", delErr);
      return res.status(500).json({
        ok: false,
        error: "DELETE_SECTION_FAILED",
        details: delErr.message,
      });
    }

    return res.json({
      ok: true,
      deletedSectionId: sectionId,
      deletedName: existing.name,
    });
  } catch (err) {
    console.error("deleteSection fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  getServiceCategories,
  addServiceCategory,
  listSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
};