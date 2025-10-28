// src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// routes
const superAdminAuthRoutes = require("./routes/superadmin/authRoutes");
const superadminSalonRoutes = require("./routes/superadmin/salonRoutes");
const superAdminStatsRoutes = require("./routes/superadmin/statsRoutes");
const debugRoutes = require("./routes/debugRoutes");

const app = express();
const PORT = process.env.PORT || 4000;


const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

// security headers
app.use(helmet());

// CORS (this will also respond to OPTIONS automatically in Express 5)
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

// parse JSON bodies
app.use(express.json());

// request logging
app.use(morgan("dev"));

// basic rate limiting
app.use(
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,            // max requests / IP / minute
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// health check
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    env: process.env.NODE_ENV || "dev",
  });
});

// debug (temporary)
app.use("/debug", debugRoutes);

// super admin API
app.use("/api/superadmin/auth", superAdminAuthRoutes);
app.use("/api/superadmin/salons", superadminSalonRoutes);
app.use("/api/superadmin/stats", superAdminStatsRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// boot server
app.listen(PORT, () => {
  console.log(`✅ API server running on http://localhost:${PORT}`);

});
