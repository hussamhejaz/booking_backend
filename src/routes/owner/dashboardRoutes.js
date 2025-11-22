const express = require("express");
const router = express.Router();
const requireOwner = require("../../middleware/requireOwner");
const { getDashboardSummary } = require("../../controllers/owner/dashboardController");

router.get("/", requireOwner, getDashboardSummary);

module.exports = router;
