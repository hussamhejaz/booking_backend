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

// owner routes
const ownerAuthRoutes = require("./routes/owner/authRoutes");
const ownerSectionRoutes = require("./routes/owner/sectionRoutes");
const ownerProfileRoutes = require("./routes/owner/profileRoutes");
const ownerWorkingHoursRoutes = require("./routes/owner/workingHoursRoutes");
const homeServicesRoutes = require("./routes/owner/homeServices");
const ownerOffersRoutes = require("./routes/owner/offersRoutes");
const ownerPricingRoutes = require("./routes/owner/pricingRoutes");
const ownerBookingRoutes = require("./routes/owner/bookingRoutes");
const homeServiceBookingRoutes = require("./routes/owner/homeServiceBookingRoutes"); 
const ownerReviewsRoutes = require("./routes/owner/reviewsRoutes");

const ownerDashboardRoutes = require("./routes/owner/dashboardRoutes");
const ownerAvailabilityRoutes = require("./routes/owner/availabilityRoutes");
const ownerTimeSlotRoutes = require("./routes/owner/timeSlotRoutes");

// public routes
const publicHomeServicesRoutes = require("./routes/public/homeServices");
const publicSectionsRoutes = require("./routes/public/sections");
const publicWorkingHoursRoutes = require("./routes/public/workingHours"); 
const publicOffersRoutes = require("./routes/public/offers");
const publicServicesRoutes = require("./routes/public/services");
const publicHoursRoutes = require("./routes/public/hours");
const publicHomeServiceBookingRoutes = require("./routes/public/homeServiceBookings");
const publicReviewsRoutes = require("./routes/public/reviewsRoutes");

const publicBookingRoutes = require("./routes/public/bookings");


const app = express();
const PORT = process.env.PORT || 4000;

/* ---------------------- CORS setup ---------------------- */
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  "http://localhost:5173",
  "https://booking-backend-9s77.onrender.com",
  "https://admindashboard988.netlify.app",
  "http://localhost:5174"
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
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

// Superadmin routes
app.use("/api/superadmin/auth", superAdminAuthRoutes);
app.use("/api/superadmin/salons", superadminSalonRoutes);
app.use("/api/superadmin/stats", superAdminStatsRoutes);

// OWNER API
app.use("/api/owner/auth", ownerAuthRoutes);
app.use("/api/owner/sections", ownerSectionRoutes);
app.use("/api/owner/profile", ownerProfileRoutes);
app.use("/api/owner/working-hours", ownerWorkingHoursRoutes);
app.use("/api/owner/home-services", homeServicesRoutes);
app.use("/api/owner/offers", ownerOffersRoutes); 
app.use("/api/owner", ownerPricingRoutes);
app.use("/api/owner/bookings", ownerBookingRoutes);
app.use("/api/owner/home-service-bookings", homeServiceBookingRoutes);
app.use("/api/owner/reviews", ownerReviewsRoutes);

app.use("/api/owner/dashboard", ownerDashboardRoutes);
app.use("/api/owner/availability", ownerAvailabilityRoutes);
app.use("/api/owner/time-slots", ownerTimeSlotRoutes);

// Public routes
app.use("/api/public", publicHomeServicesRoutes);
app.use("/api/public", publicSectionsRoutes); 
app.use("/api/public", publicWorkingHoursRoutes);
app.use("/api/public", publicOffersRoutes);
app.use("/api/public", publicServicesRoutes);
app.use("/api/public", publicHoursRoutes);
app.use("/api/public", publicHomeServiceBookingRoutes);
app.use("/api/public", publicReviewsRoutes);

app.use("/api/public", publicBookingRoutes);




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
