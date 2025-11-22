const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  getSectionServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getAllSalonServices,
} = require("../../controllers/owner/pricingController");
const {
  listServiceTimeSlots,
  upsertServiceTimeSlots,
  deleteServiceTimeSlot,
} = require("../../controllers/owner/serviceSlotController");

// GET /api/owner/services - Get all services for the salon
router.get("/services", requireOwner, getAllSalonServices);

// GET /api/owner/sections/:sectionId/services - Get services for a specific section
router.get("/sections/:sectionId/services", requireOwner, getSectionServices);

// GET /api/owner/services/:serviceId - Get single service
router.get("/services/:serviceId", requireOwner, getServiceById);

// POST /api/owner/sections/:sectionId/services - Create new service
router.post("/sections/:sectionId/services", requireOwner, createService);

// PATCH /api/owner/services/:serviceId - Update service
router.patch("/services/:serviceId", requireOwner, updateService);

// DELETE /api/owner/services/:serviceId - Delete service
router.delete("/services/:serviceId", requireOwner, deleteService);

// GET /api/owner/services/:serviceId/slots - List service-specific slots
router.get("/services/:serviceId/slots", requireOwner, listServiceTimeSlots);

// PUT /api/owner/services/:serviceId/slots - Replace service slots
router.put("/services/:serviceId/slots", requireOwner, upsertServiceTimeSlots);

// DELETE /api/owner/services/:serviceId/slots/:slotId - Remove one slot
router.delete(
  "/services/:serviceId/slots/:slotId",
  requireOwner,
  deleteServiceTimeSlot
);

module.exports = router;
