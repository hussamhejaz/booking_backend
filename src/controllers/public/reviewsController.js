// src/controllers/public/reviewsController.js
const { supabaseAdmin } = require("../../supabase");

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 50;

function toInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1";
}

function sanitizePublicReview(review) {
  if (!review) return null;
  const ratingValue = Number(review.rating);
  return {
    id: review.id,
    name: review.reviewer_name || null,
    rating: Number.isNaN(ratingValue) ? 0 : ratingValue,
    text: review.message || null,
    photos: Array.isArray(review.photos) ? review.photos : [],
    helpful: review.helpful_count || 0,
    date: review.created_at ? review.created_at.slice(0, 10) : null,
  };
}

async function fetchActiveSalon(salonId) {
  if (!supabaseAdmin) {
    return { error: "SUPABASE_NOT_CONFIGURED" };
  }

  const { data, error } = await supabaseAdmin
    .from("salons")
    .select("id, name, brand_color, is_active")
    .eq("id", salonId)
    .eq("is_active", true)
    .single();

  if (error) {
    console.error("fetchActiveSalon error:", error);
    return { error: "SALON_NOT_FOUND" };
  }

  if (!data) {
    return { error: "SALON_NOT_FOUND" };
  }

  return { salon: data };
}

async function listPublicReviews(req, res) {
  try {
    const { salonId } = req.params;
    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    const { salon, error: salonError } = await fetchActiveSalon(salonId);
    if (salonError) {
      const status = salonError === "SUPABASE_NOT_CONFIGURED" ? 500 : 404;
      return res.status(status).json({
        ok: false,
        error: salonError,
      });
    }

    const page = Math.max(toInteger(req.query.page, 1), 1);
    const limit = Math.min(Math.max(toInteger(req.query.limit, DEFAULT_LIMIT), 1), MAX_LIMIT);
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const ratingFilter = toInteger(req.query.rating, null);

    let query = supabaseAdmin
      .from("reviews")
      .select(
        `
          id,
          rating,
          reviewer_name,
          message,
          photos,
          helpful_count,
          created_at
        `,
        { count: "exact" }
      )
      .eq("salon_id", salonId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false });

    if (ratingFilter >= 1 && ratingFilter <= 5) {
      query = query.eq("rating", ratingFilter);
    }

    const { data, error, count } = await query.range(start, end);

    if (error) {
      console.error("listPublicReviews error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_REVIEWS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color,
      },
      page,
      limit,
      total: typeof count === "number" ? count : (data || []).length,
      reviews: (data || []).map(sanitizePublicReview),
    });
  } catch (err) {
    console.error("listPublicReviews fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

async function createPublicReview(req, res) {
  try {
    const { salonId } = req.params;
    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    const { salon, error: salonError } = await fetchActiveSalon(salonId);
    if (salonError) {
      const status = salonError === "SUPABASE_NOT_CONFIGURED" ? 500 : 404;
      return res.status(status).json({
        ok: false,
        error: salonError,
      });
    }

    const { name, phone, email, rating, message, consent } = req.body || {};
    if (!name || !phone || (rating === undefined || rating === null)) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_REQUIRED_FIELDS",
      });
    }

    const parsedRating = Math.max(1, Math.min(5, Number(rating)));
    const consentValue = toBoolean(consent);

    const insertPayload = {
      salon_id: salonId,
      rating: parsedRating,
      reviewer_name: name.trim(),
      reviewer_phone: phone.trim(),
      reviewer_email: email?.trim() || null,
      message: message?.trim() || null,
      consent: consentValue,
      is_visible: consentValue,
      helpful_count: 0,
    };

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .insert([insertPayload])
      .select(
        `
          id,
          rating,
          reviewer_name,
          message,
          photos,
          helpful_count,
          created_at
        `
      )
      .single();

    if (error) {
      console.error("createPublicReview error:", error);
      return res.status(500).json({
        ok: false,
        error: "SAVE_REVIEW_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
      },
      review: sanitizePublicReview(data),
      message: "Thank you for sharing your feedback.",
    });
  } catch (err) {
    console.error("createPublicReview fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

async function getPublicReviewFeatures(req, res) {
  try {
    const { salonId } = req.params;
    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    const { salon, error: salonError } = await fetchActiveSalon(salonId);
    if (salonError) {
      const status = salonError === "SUPABASE_NOT_CONFIGURED" ? 500 : 404;
      return res.status(status).json({
        ok: false,
        error: salonError,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select("rating")
      .eq("salon_id", salonId)
      .eq("is_visible", true);

    if (error) {
      console.error("getPublicReviewFeatures error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_REVIEW_FEATURES_FAILED",
        details: error.message,
      });
    }

    const total = (data || []).length;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;

    (data || []).forEach((review) => {
      const ratingValue = Number(review.rating);
      if (Number.isNaN(ratingValue)) return;
      const bounded = Math.max(1, Math.min(5, ratingValue));
      sum += bounded;
      distribution[bounded] += 1;
    });

    const average = total ? Math.round((sum / total) * 10) / 10 : 0;

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
      },
      total,
      average,
      distribution,
    });
  } catch (err) {
    console.error("getPublicReviewFeatures fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listPublicReviews,
  createPublicReview,
  getPublicReviewFeatures,
};
