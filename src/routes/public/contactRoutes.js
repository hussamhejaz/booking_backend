const express = require("express");
const router = express.Router();

const {
  createPublicContact,
} = require("../../controllers/public/contactController");

// POST /api/public/contact
router.post("/contact", createPublicContact);

module.exports = router;
