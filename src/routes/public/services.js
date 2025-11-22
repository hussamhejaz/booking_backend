const express = require("express");
const router = express.Router();

const {
  listPublicServices,
  listPublicServicesBySection,
  getPublicServiceById,
  searchPublicServices,
} = require("../../controllers/public/servicesController");

// GET /api/public/:salonId/services
router.get("/:salonId/services", listPublicServices);

// GET /api/public/:salonId/sections/:sectionId/services
router.get("/:salonId/sections/:sectionId/services", listPublicServicesBySection);

// GET /api/public/:salonId/services/:serviceId
router.get("/:salonId/services/:serviceId", getPublicServiceById);

// GET /api/public/:salonId/services/search
router.get("/:salonId/services/search", searchPublicServices);

module.exports = router;