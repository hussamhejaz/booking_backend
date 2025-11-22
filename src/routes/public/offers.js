// src/routes/public/offers.js
const express = require("express");
const router = express.Router();

const {
  listPublicOffers,
  getPublicOfferById,
  getPublicOfferCategories,
  getFeaturedOffers,
} = require("../../controllers/public/offersController");

// GET /api/public/:salonId/offers
router.get("/:salonId/offers", listPublicOffers);

// GET /api/public/:salonId/offers/featured
router.get("/:salonId/offers/featured", getFeaturedOffers);

// GET /api/public/:salonId/offers/categories
router.get("/:salonId/offers/categories", getPublicOfferCategories);

// GET /api/public/:salonId/offers/:offerId
router.get("/:salonId/offers/:offerId", getPublicOfferById);

module.exports = router;