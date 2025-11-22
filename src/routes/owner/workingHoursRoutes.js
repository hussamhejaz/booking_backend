const express = require("express");
const router = express.Router();
const requireOwner = require("../../middleware/requireOwner"); // Make sure this path is correct
const {
  getWorkingHours,
  updateWorkingHours,
  resetWorkingHours
} = require("../../controllers/owner/workingHoursController");

// Apply authentication middleware to ALL routes
router.use(requireOwner);

// GET /api/owner/working-hours - Get working hours
router.get("/", getWorkingHours);

// PUT /api/owner/working-hours - Update working hours
router.put("/", updateWorkingHours);

// POST /api/owner/working-hours/reset - Reset to default working hours
router.post("/reset", resetWorkingHours);

module.exports = router;