const express = require("express");
const router = express.Router();

const {
  listPublicServiceEmployees,
} = require("../../controllers/public/employeeController");

// GET /api/public/:salonId/services/:serviceId/employees
router.get(
  "/:salonId/services/:serviceId/employees",
  listPublicServiceEmployees
);

module.exports = router;
