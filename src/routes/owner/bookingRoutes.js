// src/routes/owner/bookingRoutes.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  getAvailability,
  getBookingStats,
  archiveBooking,
  unarchiveBooking,
} = require("../../controllers/owner/bookingController");

// Require owner authentication for everything below
router.use(requireOwner);

// GET /api/owner/bookings
router.get("/", listBookings);

// GET /api/owner/bookings/stats/overview
router.get("/stats/overview", getBookingStats);

// GET /api/owner/bookings/calendar/availability
router.get("/calendar/availability", getAvailability);

// POST /api/owner/bookings/:bookingId/archive
router.post("/:bookingId/archive", archiveBooking);

// POST /api/owner/bookings/:bookingId/unarchive
router.post("/:bookingId/unarchive", unarchiveBooking);

// GET /api/owner/bookings/:bookingId
router.get("/:bookingId", getBookingById);

// POST /api/owner/bookings
router.post("/", createBooking);

// PATCH /api/owner/bookings/:bookingId
router.patch("/:bookingId", updateBooking);

// DELETE /api/owner/bookings/:bookingId
router.delete("/:bookingId", deleteBooking);

module.exports = router;
