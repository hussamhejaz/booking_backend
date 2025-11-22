const express = require("express");
const router = express.Router();

const {
  listPublicReviews,
  createPublicReview,
  getPublicReviewFeatures,
} = require("../../controllers/public/reviewsController");

// GET /api/public/:salonId/reviews
router.get("/:salonId/reviews", listPublicReviews);

// POST /api/public/:salonId/reviews
router.post("/:salonId/reviews", createPublicReview);

// GET /api/public/:salonId/reviews/features
router.get("/:salonId/reviews/features", getPublicReviewFeatures);

module.exports = router;
