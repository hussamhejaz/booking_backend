// src/routes/owner/homeServices.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listHomeServices,
  getHomeServiceById,
  createHomeService,
  updateHomeService,
  deleteHomeService,
  getAvailableCategories,
} = require("../../controllers/owner/homeServicesController");
const {
  listHomeServiceSlots,
  upsertHomeServiceSlots,
  deleteHomeServiceSlot,
} = require("../../controllers/owner/homeServiceSlotController");

// GET /api/owner/home-services
router.get("/", requireOwner, listHomeServices);

// GET /api/owner/home-services/categories/available
router.get("/categories/available", requireOwner, getAvailableCategories);

// GET /api/owner/home-services/:serviceId
router.get("/:serviceId", requireOwner, getHomeServiceById);

// POST /api/owner/home-services
router.post("/", requireOwner, createHomeService);

// PATCH /api/owner/home-services/:serviceId
router.patch("/:serviceId", requireOwner, updateHomeService);

// DELETE /api/owner/home-services/:serviceId
router.delete("/:serviceId", requireOwner, deleteHomeService);

// GET /api/owner/home-services/:serviceId/slots
router.get("/:serviceId/slots", requireOwner, listHomeServiceSlots);

// PUT /api/owner/home-services/:serviceId/slots
router.put("/:serviceId/slots", requireOwner, upsertHomeServiceSlots);

// DELETE /api/owner/home-services/:serviceId/slots/:slotId
router.delete(
  "/:serviceId/slots/:slotId",
  requireOwner,
  deleteHomeServiceSlot
);

module.exports = router;
