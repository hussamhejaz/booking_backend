const express = require("express");
const router = express.Router();

// Import controllers
const bookingController = require("../../controllers/public/bookingController");
const servicesController = require("../../controllers/public/servicesController");

// Booking routes
router.get("/bookings/available-slots", bookingController.getAvailableSlots);
router.post("/bookings", bookingController.createBooking);
router.get("/bookings/:bookingId", bookingController.getBookingDetails);

// Services routes  
router.get("/services", servicesController.listPublicServices);
router.get("/sections/:sectionId/services", servicesController.listPublicServicesBySection);
router.get("/services/:serviceId", servicesController.getPublicServiceById);
router.get("/services/search", servicesController.searchPublicServices);

module.exports = router;