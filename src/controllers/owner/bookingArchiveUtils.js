// src/controllers/owner/bookingArchiveUtils.js
// Helpers for archive/unarchive flow to keep controller logic readable and testable.

function toBool(val) {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") {
    const lowered = val.toLowerCase().trim();
    return ["true", "1", "yes", "y"].includes(lowered);
  }
  return false;
}

function parseArchiveParams(query = {}) {
  const includeArchived = toBool(query.include_archived);
  const archivedOnly = toBool(query.archived_only);

  return {
    includeArchived: archivedOnly ? true : includeArchived,
    archivedOnly,
  };
}

function applyArchiveFilters(query, { includeArchived, archivedOnly }) {
  if (archivedOnly) {
    return query.eq("archived", true);
  }
  if (!includeArchived) {
    return query.eq("archived", false);
  }
  return query;
}

function validateArchiveAction(booking, action) {
  if (!booking) {
    return { ok: false, code: "BOOKING_NOT_FOUND" };
  }

  if (booking.status !== "completed") {
    return { ok: false, code: "BOOKING_NOT_COMPLETED" };
  }

  if (action === "archive" && booking.archived) {
    return { ok: true, already: true };
  }

  if (action === "unarchive" && !booking.archived) {
    return { ok: true, already: true };
  }

  return { ok: true, already: false };
}

module.exports = {
  parseArchiveParams,
  applyArchiveFilters,
  validateArchiveAction,
  toBool,
};
