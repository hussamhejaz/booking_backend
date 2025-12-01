// src/tests/bookingArchive.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArchiveParams,
  applyArchiveFilters,
  validateArchiveAction,
} = require("../controllers/owner/bookingArchiveUtils");

class FakeQuery {
  constructor() {
    this.calls = [];
  }

  eq(field, value) {
    this.calls.push({ field, value });
    return this;
  }
}

test("parseArchiveParams defaults to hiding archived", () => {
  const parsed = parseArchiveParams({});
  assert.equal(parsed.includeArchived, false);
  assert.equal(parsed.archivedOnly, false);
});


test("parseArchiveParams allows include_archived and archived_only", () => {
  const include = parseArchiveParams({ include_archived: "true" });
  assert.equal(include.includeArchived, true);
  assert.equal(include.archivedOnly, false);

  const only = parseArchiveParams({ archived_only: "true" });
  assert.equal(only.includeArchived, true);
  assert.equal(only.archivedOnly, true);
});

test("applyArchiveFilters excludes archived by default", () => {
  const query = new FakeQuery();
  applyArchiveFilters(query, { includeArchived: false, archivedOnly: false });
  assert.deepEqual(query.calls, [{ field: "archived", value: false }]);
});

test("applyArchiveFilters can request only archived", () => {
  const query = new FakeQuery();
  applyArchiveFilters(query, { includeArchived: true, archivedOnly: true });
  assert.deepEqual(query.calls, [{ field: "archived", value: true }]);
});

test("validateArchiveAction blocks non-completed bookings", () => {
  const result = validateArchiveAction(
    { status: "pending", archived: false },
    "archive"
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "BOOKING_NOT_COMPLETED");
});

test("validateArchiveAction is idempotent for archive/unarchive", () => {
  const alreadyArchived = validateArchiveAction(
    { status: "completed", archived: true },
    "archive"
  );
  assert.equal(alreadyArchived.ok, true);
  assert.equal(alreadyArchived.already, true);

  const alreadyActive = validateArchiveAction(
    { status: "completed", archived: false },
    "unarchive"
  );
  assert.equal(alreadyActive.ok, true);
  assert.equal(alreadyActive.already, true);

  const canArchive = validateArchiveAction(
    { status: "completed", archived: false },
    "archive"
  );
  assert.equal(canArchive.ok, true);
  assert.equal(canArchive.already, false);
});
