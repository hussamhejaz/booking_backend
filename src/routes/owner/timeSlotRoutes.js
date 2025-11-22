const express = require("express");
const router = express.Router();
const requireOwner = require("../../middleware/requireOwner");
const {
  listTimeSlots,
  upsertTimeSlots,
  deleteTimeSlot,
} = require("../../controllers/owner/timeSlotController");

router.use(requireOwner);

// GET /api/owner/time-slots?day=1
router.get("/", listTimeSlots);

// PUT /api/owner/time-slots
router.put("/", upsertTimeSlots);

// DELETE /api/owner/time-slots/:slotId
router.delete("/:slotId", deleteTimeSlot);

module.exports = router;
