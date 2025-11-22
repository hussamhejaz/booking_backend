// src/routes/owner/offers.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  getOffersStats,
  getOfferCategories,
} = require("../../controllers/owner/offersController");

// All routes require owner authentication
router.use(requireOwner);

// GET /api/owner/offers/categories
router.get("/categories", getOfferCategories);

// GET /api/owner/offers
router.get("/", listOffers);

// GET /api/owner/offers/stats/summary
router.get("/stats/summary", getOffersStats);

// GET /api/owner/offers/:offerId
router.get("/:offerId", getOfferById);

// POST /api/owner/offers
router.post("/", createOffer);

// PATCH /api/owner/offers/:offerId
router.patch("/:offerId", updateOffer);

// DELETE /api/owner/offers/:offerId
router.delete("/:offerId", deleteOffer);

module.exports = router;
