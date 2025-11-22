const express = require("express");
const router = express.Router();

const {
  listPublicSections,
  getPublicSectionById,
} = require("../../controllers/public/sectionsController");

// GET /api/public/:salonId/sections
router.get("/:salonId/sections", listPublicSections);

// GET /api/public/:salonId/sections/:sectionId
router.get("/:salonId/sections/:sectionId", getPublicSectionById);

module.exports = router;