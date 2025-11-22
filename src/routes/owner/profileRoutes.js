const express = require("express");
const router = express.Router();
const requireOwner = require("../../middleware/requireOwner");
const {
  getProfile,
  updateProfile,
  changePassword,
} = require("../../controllers/owner/profileController");

// All routes require owner authentication
router.use(requireOwner);

// GET /api/owner/profile - Get owner profile and salon info
router.get("/", getProfile);

// PATCH /api/owner/profile - Update owner email/profile
router.patch("/", updateProfile);

// PATCH /api/owner/profile/password - Change password
router.patch("/password", changePassword);

module.exports = router;