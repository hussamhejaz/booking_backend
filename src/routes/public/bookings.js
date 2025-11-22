const express = require("express");
const router = express.Router();

const {
  createPublicBooking,
  getPublicAvailability,
} = require("../../controllers/public/bookingController");

// POST /api/public/:salonId/bookings
router.post("/:salonId/bookings", createPublicBooking);

// GET /api/public/:salonId/bookings/availability?date=YYYY-MM-DD
router.get("/:salonId/bookings/availability", getPublicAvailability);

module.exports = router;
