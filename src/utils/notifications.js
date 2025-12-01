// src/utils/notifications.js
const { supabaseAdmin } = require("../supabase");

/**
 * Record a booking notification for a salon.
 * Swallows errors to avoid blocking booking creation.
 */
async function recordBookingNotification({
  salonId,
  bookingId = null,
  homeBookingId = null,
  title,
  message,
  metadata = {},
}) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("booking_notifications").insert({
      salon_id: salonId,
      booking_id: bookingId,
      home_booking_id: homeBookingId,
      title: title || "New booking",
      message: message || "",
      metadata,
    });
  } catch (err) {
    console.error("recordBookingNotification error:", err);
  }
}

module.exports = {
  recordBookingNotification,
};
