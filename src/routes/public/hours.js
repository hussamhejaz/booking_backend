const express = require("express");
const router = express.Router();

const { getPublicAvailableHours } = require("../../controllers/public/hoursController");

// GET /api/public/:salonId/hours
router.get("/:salonId/hours", getPublicAvailableHours);

module.exports = router;
