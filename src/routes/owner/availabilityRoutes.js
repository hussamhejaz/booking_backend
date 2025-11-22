const express = require("express");
const router = express.Router();
const requireOwner = require("../../middleware/requireOwner");
const { getOwnerAvailableSlots } = require("../../controllers/owner/availabilityController");

// GET /api/owner/availability/slots?date=YYYY-MM-DD
router.get("/slots", requireOwner, getOwnerAvailableSlots);

module.exports = router;
