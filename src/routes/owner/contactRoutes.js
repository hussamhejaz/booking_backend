const express = require("express");
const router = express.Router();

const requireOwner = require("../../middleware/requireOwner");
const {
  listContacts,
  updateContactStatus,
} = require("../../controllers/owner/contactController");

router.use(requireOwner);

// GET /api/owner/contacts
router.get("/", listContacts);

// PATCH /api/owner/contacts/:contactId
router.patch("/:contactId", updateContactStatus);

module.exports = router;
