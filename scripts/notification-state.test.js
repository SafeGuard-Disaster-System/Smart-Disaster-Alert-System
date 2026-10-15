const assert = require("node:assert/strict");
const {
  createTracker,
  getActiveAlerts
} = require("../notification-state");

const now = Date.parse("2026-10-14T12:00:00Z");
const existingAlert = {
  id: "existing-1",
  status: "Active",
  expiresAt: now + 60_000
};
const newAlert = {
  id: "new-1",
  status: "Active",
  expiresAt: now + 60_000
};

const tracker = createTracker();
assert.deepEqual(tracker.observe([existingAlert], now), []);
assert.deepEqual(tracker.observe([existingAlert, newAlert], now), [newAlert]);
assert.deepEqual(tracker.observe([existingAlert, newAlert], now), []);
assert.deepEqual(tracker.observe([newAlert], now), []);

assert.deepEqual(
  getActiveAlerts([
    existingAlert,
    { id: "expired", status: "Active", expiresAt: now },
    { id: "invalid-expiry", status: "Active", expiresAt: "not-a-date" },
    { id: "resolved", status: "Resolved", expiresAt: now + 60_000 },
    { id: "invalid-status", status: "Pending", expiresAt: now + 60_000 },
    { id: "cancelled", status: "Active", msgType: "Cancel" },
    { id: "cancelled-flag", status: "Active", cancelled: true },
    { id: "missing-status", expiresAt: now + 60_000 },
    { status: "Active", expiresAt: now + 60_000 }
  ], now),
  [existingAlert]
);

const inactiveTracker = createTracker();
assert.deepEqual(inactiveTracker.observe([], now), []);
assert.deepEqual(inactiveTracker.observe([newAlert], now), [newAlert]);

console.log("PASS: Initial snapshot is not announced");
console.log("PASS: New active IDs are announced once, including after removal");
console.log("PASS: Missing/invalid status, expired, resolved, cancelled, and ID-less records are excluded");
console.log("PASS: Empty initial snapshot does not suppress later new alerts");
console.log("Notification state tests passed: 4/4");