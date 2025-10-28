// src/routes/superadmin/salonRoutes.js
const express = require("express");
const router = express.Router();

const requireSuperAdmin = require("../../middleware/requireSuperAdmin");
const {
  listSalons,
  createSalon,
  deleteSalon,
  getSalonById,
  updateSalon,
} = require("../../controllers/superadmin/salonController");

// GET /api/superadmin/salons
router.get("/", requireSuperAdmin, listSalons);

// POST /api/superadmin/salons
router.post("/", requireSuperAdmin, createSalon);

// GET /api/superadmin/salons/:salonId
router.get("/:salonId", requireSuperAdmin, getSalonById);

// PATCH /api/superadmin/salons/:salonId   <-- new
router.patch("/:salonId", requireSuperAdmin, updateSalon);

// DELETE /api/superadmin/salons/:salonId
router.delete("/:salonId", requireSuperAdmin, deleteSalon);

module.exports = router;
