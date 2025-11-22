const { supabaseAdmin } = require("../../supabase");

// GET /api/public/:salonId/sections
async function listPublicSections(req, res) {
  try {
    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // First, verify the salon exists and is active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, name, brand_color, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Get active sections for this salon
    const { data: sections, error: sectionsError } = await supabaseAdmin
      .from("sections")
      .select(`
        id,
        name,
        subtitle,
        description,
        features,
        icon_key,
        created_at
      `)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (sectionsError) {
      console.error("listPublicSections error:", sectionsError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SECTIONS_FAILED",
        details: sectionsError.message,
      });
    }

    // Get valid categories for icon mapping
    const categories = await getValidCategories(salonId);

    // Map sections with category data
    const sectionsWithIcons = (sections || []).map(section => ({
      ...section,
      category_data: categories.find(cat => cat.value === section.icon_key) || null
    }));

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color
      },
      sections: sectionsWithIcons
    });
  } catch (err) {
    console.error("listPublicSections fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/sections/:sectionId
async function getPublicSectionById(req, res) {
  try {
    const { salonId, sectionId } = req.params;

    if (!salonId || !sectionId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_PARAMETERS",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Verify salon exists and is active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Get the specific section
    const { data: section, error: sectionError } = await supabaseAdmin
      .from("sections")
      .select(`
        id,
        name,
        subtitle,
        description,
        features,
        icon_key,
        is_active,
        created_at
      `)
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    // Get category data for the icon
    const categories = await getValidCategories(salonId);

    return res.json({
      ok: true,
      section: {
        ...section,
        category_data: categories.find(cat => cat.value === section.icon_key) || null
      }
    });
  } catch (err) {
    console.error("getPublicSectionById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
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

module.exports = {
  listPublicSections,
  getPublicSectionById,
};