// src/routes/owner/homeServiceBookingRoutes.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listHomeServiceBookings,
  getHomeServiceBookingById,
  createHomeServiceBooking,
  updateHomeServiceBooking,
  deleteHomeServiceBooking,
  getHomeServiceBookingStats,
} = require("../../controllers/owner/homeServiceBookingController");

// GET /api/owner/home-service-bookings
router.get("/", requireOwner, listHomeServiceBookings);

// GET /api/owner/home-service-bookings/stats/overview
router.get("/stats/overview", requireOwner, getHomeServiceBookingStats);

// GET /api/owner/home-service-bookings/:bookingId
router.get("/:bookingId", requireOwner, getHomeServiceBookingById);

// POST /api/owner/home-service-bookings
router.post("/", requireOwner, createHomeServiceBooking);

// PATCH /api/owner/home-service-bookings/:bookingId
router.patch("/:bookingId", requireOwner, updateHomeServiceBooking);

// DELETE /api/owner/home-service-bookings/:bookingId
router.delete("/:bookingId", requireOwner, deleteHomeServiceBooking);

module.exports = router;