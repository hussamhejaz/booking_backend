// src/routes/superadmin/statsRoutes.js
const express = require("express");
const router = express.Router();

const requireSuperAdmin = require("../../middleware/requireSuperAdmin");
const { getPlatformStats } = require("../../controllers/superadmin/statsController");

// GET /api/superadmin/stats
router.get("/", requireSuperAdmin, getPlatformStats);

module.exports = router;
