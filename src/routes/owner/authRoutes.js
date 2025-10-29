const express = require("express");
const router = express.Router();
const { ownerLogin } = require("../../controllers/owner/authController");

// public login route
router.post("/login", ownerLogin);

module.exports = router;
