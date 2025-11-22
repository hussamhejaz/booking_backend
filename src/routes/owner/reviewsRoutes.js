const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listReviewsForOwner,
  getReviewForOwner,
  updateReviewForOwner,
} = require("../../controllers/owner/reviewsController");

router.use(requireOwner);

// GET /api/owner/reviews
router.get("/", listReviewsForOwner);

// GET /api/owner/reviews/:reviewId
router.get("/:reviewId", getReviewForOwner);

// PATCH /api/owner/reviews/:reviewId
router.patch("/:reviewId", updateReviewForOwner);

module.exports = router;
