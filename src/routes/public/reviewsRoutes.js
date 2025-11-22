const express = require("express");
const router = express.Router();

const {
  listPublicReviews,
  createPublicReview,
} = require("../../controllers/public/reviewsController");

// GET /api/public/:salonId/reviews
router.get("/:salonId/reviews", listPublicReviews);

// POST /api/public/:salonId/reviews
router.post("/:salonId/reviews", createPublicReview);

module.exports = router;
