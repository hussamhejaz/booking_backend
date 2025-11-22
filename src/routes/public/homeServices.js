const express = require("express");
const router = express.Router();

const {
  listPublicHomeServices,
  getPublicCategories,
} = require("../../controllers/public/homeServicesController");

// GET /api/public/:salonId/home-services
router.get("/:salonId/home-services", listPublicHomeServices);

// GET /api/public/:salonId/home-services/categories
router.get("/:salonId/home-services/categories", getPublicCategories);

module.exports = router;