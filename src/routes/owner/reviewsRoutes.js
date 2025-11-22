const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listReviewsForOwner,
  getReviewForOwner,
} = require("../../controllers/owner/reviewsController");

router.use(requireOwner);

// GET /api/owner/reviews
router.get("/", listReviewsForOwner);

// GET /api/owner/reviews/:reviewId
router.get("/:reviewId", getReviewForOwner);

module.exports = router;
