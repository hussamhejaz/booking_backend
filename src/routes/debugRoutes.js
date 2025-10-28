// src/routes/debugRoutes.js
const express = require("express");
const router = express.Router();
const { testSupabase } = require("../controllers/debugController");

router.get("/supabase", testSupabase);

module.exports = router;
