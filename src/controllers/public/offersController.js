// src/controllers/public/offersController.js
const { supabaseAdmin } = require("../../supabase");

// Helper to get valid categories for a salon
async function getValidCategories(salonId) {
  if (!supabaseAdmin) return [];

  try {
    const { data: customCategories } = await supabaseAdmin
      .from("salon_categories")
      .select("value, label, icon")
      .eq("salon_id", salonId);

    const defaultCategories = [
      { value: "scissors", label: "Hair Services", icon: "scissors" },
      { value: "nails", label: "Nail Care", icon: "nails" },
      { value: "makeup", label: "Makeup", icon: "makeup" },
      { value: "spa", label: "Spa Treatments", icon: "spa" },
      { value: "star", label: "Premium Services", icon: "star" },
      { value: "facial", label: "Facial Care", icon: "facial" },
      { value: "massage", label: "Massage", icon: "massage" },
      { value: "waxing", label: "Waxing", icon: "waxing" },
    ];

    return [...defaultCategories, ...(customCategories || [])];
  } catch (error) {
    console.error("getValidCategories error:", error);
    return [];
  }
}

// GET /api/public/:salonId/offers
async function listPublicOffers(req, res) {
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

    const today = new Date().toISOString().split("T")[0];

    const { data: offers, error: offersError } = await supabaseAdmin
      .from("offers")
      .select(`
        id,
        title,
        description,
        category,
        discount_percentage,
        discount_amount,
        original_price,
        final_price,
        start_date,
        end_date,
        image_url,
        terms_conditions,
        max_uses,
        used_count,
        service_id,
        created_at
      `)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .lte("start_date", today)
      .gte("end_date", today)
      .order("created_at", { ascending: false });

    if (offersError) {
      console.error("listPublicOffers error:", offersError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_OFFERS_FAILED",
        details: offersError.message,
      });
    }

    const validOffers = (offers || []).filter(
      (offer) => offer.max_uses === null || offer.used_count < offer.max_uses
    );

    const categories = await getValidCategories(salonId);

    const offersWithCategories = validOffers.map((offer) => ({
      ...offer,
      category_data:
        categories.find((cat) => cat.value === offer.category) || null,
    }));

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color,
      },
      offers: offersWithCategories,
      categories,
    });
  } catch (err) {
    console.error("listPublicOffers fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/offers/:offerId
async function getPublicOfferById(req, res) {
  try {
    const { salonId, offerId } = req.params;

    if (!salonId || !offerId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID_OR_OFFER_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

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

    const today = new Date().toISOString().split("T")[0];

    const { data: offer, error: offerError } = await supabaseAdmin
      .from("offers")
      .select(`
        id,
        title,
        description,
        category,
        discount_percentage,
        discount_amount,
        original_price,
        final_price,
        start_date,
        end_date,
        image_url,
        terms_conditions,
        max_uses,
        used_count,
        service_id,
        created_at
      `)
      .eq("id", offerId)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .lte("start_date", today)
      .gte("end_date", today)
      .single();

    if (offerError || !offer) {
      return res.status(404).json({
        ok: false,
        error: "OFFER_NOT_FOUND",
      });
    }

    if (offer.max_uses !== null && offer.used_count >= offer.max_uses) {
      return res.status(404).json({
        ok: false,
        error: "OFFER_EXPIRED",
      });
    }

    const categories = await getValidCategories(salonId);

    return res.json({
      ok: true,
      offer: {
        ...offer,
        category_data:
          categories.find((cat) => cat.value === offer.category) || null,
      },
    });
  } catch (err) {
    console.error("getPublicOfferById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/offers/categories
async function getPublicOfferCategories(req, res) {
  try {
    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    const categories = await getValidCategories(salonId);

    return res.json({
      ok: true,
      categories,
    });
  } catch (err) {
    console.error("getPublicOfferCategories fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/offers/featured
async function getFeaturedOffers(req, res) {
  try {
    const { salonId } = req.params;
    const { limit = 3 } = req.query;

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

    const today = new Date().toISOString().split("T")[0];

    const { data: offers, error: offersError } = await supabaseAdmin
      .from("offers")
      .select(`
        id,
        title,
        description,
        category,
        discount_percentage,
        discount_amount,
        original_price,
        final_price,
        start_date,
        end_date,
        image_url,
        terms_conditions,
        max_uses,
        used_count,
        service_id,
        created_at
      `)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .lte("start_date", today)
      .gte("end_date", today)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit, 10));

    if (offersError) {
      console.error("getFeaturedOffers error:", offersError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_FEATURED_OFFERS_FAILED",
        details: offersError.message,
      });
    }

    const validOffers = (offers || []).filter(
      (offer) => offer.max_uses === null || offer.used_count < offer.max_uses
    );

    const categories = await getValidCategories(salonId);

    const offersWithCategories = validOffers.map((offer) => ({
      ...offer,
      category_data:
        categories.find((cat) => cat.value === offer.category) || null,
    }));

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color,
      },
      offers: offersWithCategories,
    });
  } catch (err) {
    console.error("getFeaturedOffers fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listPublicOffers,
  getPublicOfferById,
  getPublicOfferCategories,
  getFeaturedOffers,
};
