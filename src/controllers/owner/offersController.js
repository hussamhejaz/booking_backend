// src/controllers/owner/offersController.js
const { supabaseAdmin } = require("../../supabase");

/* -----------------------------------------
   Helpers
------------------------------------------*/

// Basic required field check (used only in createOffer)
function need(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

// Shared validation for offer fields
// mode = "create" | "update"
function validateOfferData(data, mode = "create") {
  const errors = [];

  function required(field, msg = `${field} is required`) {
    if (
      data[field] === undefined ||
      data[field] === null ||
      String(data[field]).trim?.() === ""
    ) {
      errors.push(msg);
    }
  }

  if (mode === "create") {
    required("title", "Title is required");
    required("start_date", "Start date is required");
    required("end_date", "End date is required");
  } else {
    if (data.title !== undefined && String(data.title).trim() === "") {
      errors.push("Title is required");
    }
    if (data.start_date !== undefined && !data.start_date) {
      errors.push("Start date is required");
    }
    if (data.end_date !== undefined && !data.end_date) {
      errors.push("End date is required");
    }
  }

  if (data.start_date !== undefined || data.end_date !== undefined) {
    const startDate =
      data.start_date !== undefined ? new Date(data.start_date) : null;
    const endDate =
      data.end_date !== undefined ? new Date(data.end_date) : null;

    if (startDate && endDate && endDate <= startDate) {
      errors.push("End date must be after start date");
    }
  }

  if (
    data.discount_percentage !== undefined &&
    data.discount_amount !== undefined &&
    data.discount_percentage !== null &&
    data.discount_amount !== null
  ) {
    errors.push("Cannot have both discount percentage and discount amount");
  }

  if (
    data.discount_percentage !== undefined &&
    data.discount_percentage !== null
  ) {
    const p = data.discount_percentage;
    if (p < 0 || p > 100) {
      errors.push("Discount percentage must be between 0 and 100");
    }
  }

  if (data.discount_amount !== undefined && data.discount_amount !== null) {
    if (data.discount_amount < 0) {
      errors.push("Discount amount cannot be negative");
    }
  }

  if (data.original_price !== undefined && data.original_price !== null) {
    if (data.original_price < 0) {
      errors.push("Original price cannot be negative");
    }
  }

  if (data.final_price !== undefined && data.final_price !== null) {
    if (data.final_price < 0) {
      errors.push("Final price cannot be negative");
    }
  }

  if (data.max_uses !== undefined && data.max_uses !== null) {
    if (data.max_uses < 0) {
      errors.push("Max uses cannot be negative");
    }
  }

  return errors;
}

/* -----------------------------------------
   Controllers
------------------------------------------*/

// GET /api/owner/offers/categories
async function getOfferCategories(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: customCategories, error: categoriesError } =
      await supabaseAdmin
        .from("salon_categories")
        .select("value, label, icon")
        .eq("salon_id", salonId);

    if (categoriesError) {
      console.error("getOfferCategories error:", categoriesError);
    }

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

    const allCategories = [...defaultCategories, ...(customCategories || [])];

    return res.json({
      ok: true,
      categories: allCategories,
    });
  } catch (err) {
    console.error("getOfferCategories fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/offers
async function listOffers(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("offers")
      .select("*")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listOffers error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_OFFERS_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      offers: data || [],
    });
  } catch (err) {
    console.error("listOffers fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/offers/:offerId
async function getOfferById(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { offerId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .eq("salon_id", salonId)
      .single();

    if (error || !data) {
      console.error("getOfferById error:", error);
      return res.status(404).json({
        ok: false,
        error: "OFFER_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      offer: data,
    });
  } catch (err) {
    console.error("getOfferById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// POST /api/owner/offers
async function createOffer(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    need(req.body, "title");
    need(req.body, "start_date");
    need(req.body, "end_date");

    const {
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
      is_active = true,
      service_id,
    } = req.body;

    const validationErrors = validateOfferData(req.body, "create");
    if (validationErrors.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: validationErrors,
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    let calculatedFinalPrice = final_price;
    if (
      (calculatedFinalPrice === undefined ||
        calculatedFinalPrice === null) &&
      original_price
    ) {
      if (discount_percentage) {
        calculatedFinalPrice =
          original_price * (1 - discount_percentage / 100);
      } else if (discount_amount) {
        calculatedFinalPrice = original_price - discount_amount;
      }
    }

    const insertPayload = {
      salon_id: salonId,
      service_id: service_id || null,
      title: title.trim(),
      description: description?.trim() || null,
      category: category || null,
      discount_percentage: discount_percentage || null,
      discount_amount: discount_amount || null,
      original_price: original_price || null,
      final_price: calculatedFinalPrice || null,
      start_date,
      end_date,
      image_url: image_url || null,
      terms_conditions: terms_conditions || null,
      max_uses: max_uses || null,
      is_active: Boolean(is_active),
    };

    const { data, error } = await supabaseAdmin
      .from("offers")
      .insert([insertPayload])
      .select("*")
      .single();

    if (error) {
      console.error("createOffer error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_OFFER_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      offer: data,
    });
  } catch (err) {
    console.error("createOffer fatal:", err);
    return res.status(400).json({
      ok: false,
      error: err.message || "BAD_REQUEST",
    });
  }
}

// PATCH /api/owner/offers/:offerId
async function updateOffer(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { offerId } = req.params;

    if (!offerId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_OFFER_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const {
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
      is_active,
      used_count,
      service_id,
    } = req.body;

    if (Object.keys(req.body).length > 0) {
      const validationErrors = validateOfferData(req.body, "update");
      if (validationErrors.length > 0) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: validationErrors,
        });
      }
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (discount_percentage !== undefined)
      updates.discount_percentage = discount_percentage;
    if (discount_amount !== undefined)
      updates.discount_amount = discount_amount;
    if (original_price !== undefined)
      updates.original_price = original_price;
    if (final_price !== undefined) updates.final_price = final_price;
    if (start_date !== undefined) updates.start_date = start_date;
    if (end_date !== undefined) updates.end_date = end_date;
    if (image_url !== undefined) updates.image_url = image_url;
    if (terms_conditions !== undefined)
      updates.terms_conditions = terms_conditions;
    if (max_uses !== undefined) updates.max_uses = max_uses;
    if (is_active !== undefined) updates.is_active = is_active;
    if (used_count !== undefined) updates.used_count = used_count;
    if (service_id !== undefined) updates.service_id = service_id;

    const touchedOriginal = original_price !== undefined;
    const touchedPct = discount_percentage !== undefined;
    const touchedAmt = discount_amount !== undefined;
    const touchedFinal = final_price !== undefined;

    if (!touchedFinal && (touchedOriginal || touchedPct || touchedAmt)) {
      const base = original_price ?? updates.original_price;
      if (base !== undefined && base !== null) {
        if (discount_percentage !== undefined) {
          updates.final_price =
            base * (1 - (discount_percentage || 0) / 100);
        } else if (discount_amount !== undefined) {
          updates.final_price = base - (discount_amount || 0);
        }
      }
    }

    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "NO_VALID_FIELDS",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("offers")
      .update(updates)
      .eq("id", offerId)
      .eq("salon_id", salonId)
      .select("*")
      .single();

    if (error) {
      console.error("updateOffer error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_OFFER_FAILED",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        ok: false,
        error: "OFFER_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      offer: data,
    });
  } catch (err) {
    console.error("updateOffer fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// DELETE /api/owner/offers/:offerId
async function deleteOffer(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { offerId } = req.params;

    if (!offerId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_OFFER_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("offers")
      .select("id, salon_id, title")
      .eq("id", offerId)
      .eq("salon_id", salonId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({
        ok: false,
        error: "OFFER_NOT_FOUND",
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from("offers")
      .delete()
      .eq("id", offerId)
      .eq("salon_id", salonId);

    if (delErr) {
      console.error("deleteOffer error:", delErr);
      return res.status(500).json({
        ok: false,
        error: "DELETE_OFFER_FAILED",
        details: delErr.message,
      });
    }

    return res.json({
      ok: true,
      deletedOfferId: offerId,
      deletedTitle: existing.title,
    });
  } catch (err) {
    console.error("deleteOffer fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/owner/offers/stats/summary
async function getOffersStats(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { count: totalOffers, error: countError } = await supabaseAdmin
      .from("offers")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId);

    const { count: activeOffers, error: activeError } = await supabaseAdmin
      .from("offers")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("is_active", true);

    const todayISO = new Date().toISOString().split("T")[0];
    const { count: expiredOffers, error: expiredError } = await supabaseAdmin
      .from("offers")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .lt("end_date", todayISO);

    const { data: usageData, error: usageError } = await supabaseAdmin
      .from("offers")
      .select("used_count")
      .eq("salon_id", salonId);

    const totalUses =
      usageData?.reduce(
        (sum, offer) => sum + (offer.used_count || 0),
        0
      ) || 0;

    if (countError || activeError || expiredError || usageError) {
      console.error("getOffersStats error:", {
        countError,
        activeError,
        expiredError,
        usageError,
      });
      return res.status(500).json({
        ok: false,
        error: "FETCH_STATS_FAILED",
      });
    }

    return res.json({
      ok: true,
      stats: {
        total_offers: totalOffers || 0,
        active_offers: activeOffers || 0,
        expired_offers: expiredOffers || 0,
        total_uses: totalUses,
      },
    });
  } catch (err) {
    console.error("getOffersStats fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  getOffersStats,
  getOfferCategories,
};
