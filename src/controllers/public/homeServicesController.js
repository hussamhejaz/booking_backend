const { supabaseAdmin } = require("../../supabase");

// GET /api/public/:salonId/home-services
async function listPublicHomeServices(req, res) {
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

    // Get active home services for this salon
    const { data: services, error: servicesError } = await supabaseAdmin
      .from("home_services")
      .select(`
        id,
        name,
        description,
        price,
        duration_minutes,
        category,
        created_at
      `)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (servicesError) {
      console.error("listPublicHomeServices error:", servicesError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SERVICES_FAILED",
        details: servicesError.message,
      });
    }

    // Get valid categories for this salon
    const categories = await getValidCategories(salonId);

    // Map category values to full category objects
    const servicesWithCategories = (services || []).map(service => ({
      ...service,
      category_data: categories.find(cat => cat.value === service.category) || null
    }));

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color
      },
      services: servicesWithCategories,
      categories: categories
    });
  } catch (err) {
    console.error("listPublicHomeServices fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/home-services/categories
async function getPublicCategories(req, res) {
  try {
    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
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

    const categories = await getValidCategories(salonId);
    
    return res.json({
      ok: true,
      categories: categories,
    });
  } catch (err) {
    console.error("getPublicCategories fatal:", err);
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
  listPublicHomeServices,
  getPublicCategories,
};