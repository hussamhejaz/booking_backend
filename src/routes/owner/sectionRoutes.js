// src/routes/owner/sections.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  getServiceCategories,
  addServiceCategory,
  listSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
} = require("../../controllers/owner/sectionsController");

// GET /api/owner/categories
router.get("/categories", requireOwner, getServiceCategories);

// POST /api/owner/categories
router.post("/categories", requireOwner, addServiceCategory);

// GET /api/owner/sections
router.get("/", requireOwner, listSections);

// GET /api/owner/sections/:sectionId
router.get("/:sectionId", requireOwner, getSectionById);

// POST /api/owner/sections
router.post("/", requireOwner, createSection);

// PATCH /api/owner/sections/:sectionId
router.patch("/:sectionId", requireOwner, updateSection);

// DELETE /api/owner/sections/:sectionId
router.delete("/:sectionId", requireOwner, deleteSection);

module.exports = router;