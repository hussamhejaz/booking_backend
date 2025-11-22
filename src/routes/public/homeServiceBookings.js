
const express = require("express");
const router = express.Router();

const {
  createPublicHomeServiceBooking,
  listPublicHomeServiceSlots,
} = require("../../controllers/public/homeServiceBookingController");

// GET /api/public/:salonId/home-service-slots
router.get("/:salonId/home-service-slots", listPublicHomeServiceSlots);

// POST /api/public/:salonId/home-service-bookings
router.post("/:salonId/home-service-bookings", createPublicHomeServiceBooking);

module.exports = router;
