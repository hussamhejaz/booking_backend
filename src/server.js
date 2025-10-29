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

// NEW: owner routes
const ownerAuthRoutes = require("./routes/owner/authRoutes");
const ownerSectionRoutes = require("./routes/owner/sectionRoutes");


const app = express();
const PORT = process.env.PORT || 4000;

/* ---------------------- CORS setup ---------------------- */
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  "http://localhost:5173",
  "https://booking-backend-9s77.onrender.com",
  "https://admindashboard988.netlify.app"
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow Postman/etc.

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  credentials: true,
};
/* -------------------------------------------------------- */

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan("dev"));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
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

// debug
app.use("/debug", debugRoutes);

// super admin API
app.use("/api/superadmin/auth", superAdminAuthRoutes);
app.use("/api/superadmin/salons", superadminSalonRoutes);
app.use("/api/superadmin/stats", superAdminStatsRoutes);

// OWNER API (public login first)
app.use("/api/owner/auth", ownerAuthRoutes);
app.use("/api/owner/sections", ownerSectionRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ API server running on http://localhost:${PORT}`);
});
