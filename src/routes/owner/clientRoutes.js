// src/routes/owner/clientRoutes.js
const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const { listClients } = require("../../controllers/owner/clientController");

router.use(requireOwner);

// GET /api/owner/clients
router.get("/", listClients);

module.exports = router;
