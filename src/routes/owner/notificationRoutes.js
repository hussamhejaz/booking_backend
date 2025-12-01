// src/routes/owner/notificationRoutes.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const { listNotifications, markNotificationRead } = require("../../controllers/owner/notificationController");

router.use(requireOwner);

// GET /api/owner/notifications
router.get("/", listNotifications);

// Backward-compatible: GET /api/owner/notifications/bookings
router.get("/bookings", listNotifications);

// PATCH /api/owner/notifications/:notificationId/read
router.patch("/:notificationId/read", markNotificationRead);

module.exports = router;
