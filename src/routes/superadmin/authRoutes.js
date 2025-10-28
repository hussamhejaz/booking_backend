// src/routes/superadmin/authRoutes.js
const express = require("express");
const { loginSuperAdmin } = require("../../controllers/superadmin/authController");

const router = express.Router();

// POST /api/superadmin/auth/login
router.post("/login", loginSuperAdmin);

module.exports = router;
