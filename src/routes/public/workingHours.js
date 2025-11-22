const express = require("express");
const router = express.Router();

const {
  getPublicWorkingHours,
  debugSalonStatus
} = require("../../controllers/public/workingHoursController");

// GET /api/public/:salonId/working-hours
router.get("/:salonId/working-hours", getPublicWorkingHours);
router.get("/:salonId/debug", debugSalonStatus);

module.exports = router;