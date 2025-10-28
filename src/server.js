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

/* ---------------------- CORS setup ---------------------- */
const allowedOrigins = [
  process.env.CORS_ORIGIN, // optional from .env
  "http://localhost:5173",
  "https://booking-backend-9s77.onrender.com",
].filter(Boolean); // remove undefined/null

const corsOptions = {
  origin: function (origin, callback) {
    // allow tools like Postman / curl / mobile apps (no origin header)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  credentials: true,
};

/* -------------------------------------------------------- */

// security headers
app.use(helmet());

// CORS (only once)
app.use(cors(corsOptions));

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
