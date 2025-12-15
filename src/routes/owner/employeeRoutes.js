const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listEmployeesForService,
  setEmployeesForService,
} = require("../../controllers/owner/employeeController");

// Manage employees assigned to a specific service
router.get("/by-service/:serviceId", requireOwner, listEmployeesForService);
router.put("/by-service/:serviceId", requireOwner, setEmployeesForService);

// CRUD for employees
router.get("/", requireOwner, listEmployees);
router.post("/", requireOwner, createEmployee);
router.get("/:employeeId", requireOwner, getEmployeeById);
router.patch("/:employeeId", requireOwner, updateEmployee);
router.delete("/:employeeId", requireOwner, deleteEmployee);

module.exports = router;
