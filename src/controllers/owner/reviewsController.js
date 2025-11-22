// src/controllers/owner/reviewsController.js
const { supabaseAdmin } = require("../../supabase");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function toInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function mapOwnerReview(review) {
  if (!review) return null;
  const ratingValue = Number(review.rating);
  return {
    id: review.id,
    rating: Number.isNaN(ratingValue) ? 0 : ratingValue,
    name: review.reviewer_name || null,
    email: review.reviewer_email || null,
    phone: review.reviewer_phone || null,
    text: review.message || null,
    photos: Array.isArray(review.photos) ? review.photos : [],
    helpful: review.helpful_count || 0,
    consent: Boolean(review.consent),
    is_visible: Boolean(review.is_visible),
    metadata: review.metadata || null,
    created_at: review.created_at || null,
  };
}

async function listReviewsForOwner(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;

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

    const page = Math.max(toInteger(req.query.page, 1), 1);
    const limit = Math.min(Math.max(toInteger(req.query.limit, DEFAULT_LIMIT), 1), MAX_LIMIT);
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from("reviews")
      .select(
        `
          id,
          rating,
          reviewer_name,
          reviewer_email,
          reviewer_phone,
          message,
          photos,
          helpful_count,
          consent,
          is_visible,
          metadata,
          created_at
        `,
        { count: "exact" }
      )
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .range(start, end);

    if (error) {
      console.error("listReviewsForOwner error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_REVIEWS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      page,
      limit,
      total: typeof count === "number" ? count : (data || []).length,
      reviews: (data || []).map(mapOwnerReview),
    });
  } catch (err) {
    console.error("listReviewsForOwner fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

async function getReviewForOwner(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { reviewId } = req.params;

    if (!salonId) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    if (!reviewId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_REVIEW_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select(
        `
          id,
          rating,
          reviewer_name,
          reviewer_email,
          reviewer_phone,
          message,
          photos,
          helpful_count,
          consent,
          is_visible,
          metadata,
          created_at
        `
      )
      .eq("id", reviewId)
      .eq("salon_id", salonId)
      .single();

    if (error) {
      console.error("getReviewForOwner error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_REVIEW_FAILED",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        ok: false,
        error: "REVIEW_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      review: mapOwnerReview(data),
    });
  } catch (err) {
    console.error("getReviewForOwner fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

async function updateReviewForOwner(req, res) {
  try {
    const salonId = req.ownerUser?.salon_id;
    const { reviewId } = req.params;
    const { metadata, is_visible } = req.body || {};

    if (!salonId) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    if (!reviewId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_REVIEW_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const payload = {};
    if (metadata !== undefined) {
      payload.metadata = metadata;
    }
    if (is_visible !== undefined) {
      payload.is_visible = Boolean(is_visible);
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({
        ok: false,
        error: "NO_UPDATE_PAYLOAD",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .update(payload)
      .eq("id", reviewId)
      .eq("salon_id", salonId)
      .select(
        `
          id,
          rating,
          reviewer_name,
          reviewer_email,
          reviewer_phone,
          message,
          photos,
          helpful_count,
          consent,
          is_visible,
          metadata,
          created_at
        `
      )
      .single();

    if (error) {
      console.error("updateReviewForOwner error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_REVIEW_FAILED",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        ok: false,
        error: "REVIEW_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      review: mapOwnerReview(data),
    });
  } catch (err) {
    console.error("updateReviewForOwner fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listReviewsForOwner,
  getReviewForOwner,
  updateReviewForOwner,
};
