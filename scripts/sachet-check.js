
function runCapSelfTests() {
  const tests = [];

  function check(name, passed) {
    tests.push({ name, passed });
  }

  function makeRecord(overrides = {}) {
    return {
      sender: "Test-Sender",
      identifier: "CAP-001",
      sent: "2026-10-13T10:00:00Z",
      msgType: "Alert",
      timeClassification: "UNEXPIRED — manual review required",
      references: [],
      ...overrides
    };
  }

  console.log("=== SafeGuard Synthetic CAP Tests ===");
  console.log("Mode: LOCAL TESTS ONLY");
  console.log("SACHET requests: 0");
  console.log("Firebase writes: 0");

  // Test 1: Empty state structure
  const emptyState = createEmptyCapState();

  check(
    "Empty CAP state has required fields",
    emptyState.version === 1 &&
      typeof emptyState.processedMessages === "object" &&
      typeof emptyState.activeAlerts === "object" &&
      emptyState.lastUpdated === null
  );

  // Test 2: New alert is stored for review
  const testAlert = makeRecord({ identifier: "CAP-NEW" });
  const newResult = applyCapMessageToState(
    createEmptyCapState(),
    testAlert
  );

  check(
    "New alert is stored for review",
    newResult.action === "NEW_ALERT_REVIEW" &&
      Object.keys(newResult.state.activeAlerts).length === 1
  );

  // Test 3: Repeated message is detected
  const duplicateResult = applyCapMessageToState(
    newResult.state,
    testAlert
  );

  check(
    "Repeated message is detected",
    duplicateResult.action === "DUPLICATE"
  );

  // Test 4: Cancellation removes an existing alert
  const cancelResult = applyCapMessageToState(
    newResult.state,
    makeRecord({
      identifier: "CAP-CANCEL",
      sent: "2026-10-13T10:05:00Z",
      msgType: "Cancel",
      timeClassification: "CANCELLATION — REVIEW",
      references: [{
        sender: "Test-Sender",
        identifier: "CAP-NEW",
        sent: "2026-10-13T10:00:00Z"
      }]
    })
  );

  check(
    "Cancellation removes original alert",
    cancelResult.action === "CANCELLED" &&
      Object.keys(cancelResult.state.activeAlerts).length === 0
  );

  // Test 5: Expired alert is not activated
  const expiredResult = applyCapMessageToState(
    createEmptyCapState(),
    makeRecord({
      identifier: "CAP-EXPIRED",
      timeClassification: "EXPIRED"
    })
  );

  check(
    "Expired alert is not added to active state",
    expiredResult.action === "EXPIRED" &&
      Object.keys(expiredResult.state.activeAlerts).length === 0
  );

  // Test 6: Update modifies its original alert
  const originalAlert = makeRecord({
    identifier: "CAP-ORIGINAL",
    event: "Heavy Rain"
  });

  const originalResult = applyCapMessageToState(
    createEmptyCapState(),
    originalAlert
  );

  const updateRecord = makeRecord({
    identifier: "CAP-UPDATE",
    sent: "2026-10-13T10:05:00Z",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    event: "Severe Rain",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: "2026-10-13T10:00:00Z"
    }]
  });

  const updateResult = applyCapMessageToState(
    originalResult.state,
    updateRecord
  );

  check(
    "Update modifies referenced original alert",
    updateResult.action === "UPDATED" &&
      updateResult.state.activeAlerts[
        "Test-Sender|CAP-ORIGINAL"
      ]?.event === "Severe Rain" &&
      Object.keys(updateResult.state.activeAlerts).length === 1
  );

  // Test 7: Unknown update remains retryable
  const unknownUpdate = makeRecord({
    identifier: "CAP-UNKNOWN-UPDATE",
    sent: "2026-10-13T10:10:00Z",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    event: "Severe Rain",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-NOT-FOUND",
      sent: "2026-10-13T09:00:00Z"
    }]
  });

  const unknownUpdateResult = applyCapMessageToState(
    createEmptyCapState(),
    unknownUpdate
  );

  const unknownUpdateKey =
    `${unknownUpdate.sender}|${unknownUpdate.identifier}|${unknownUpdate.sent}`;

  check(
    "Update with unknown reference requires review",
    unknownUpdateResult.action === "UPDATE_REVIEW" &&
      Object.keys(unknownUpdateResult.state.activeAlerts).length === 0
  );

  check(
    "Unknown update remains retryable",
    !unknownUpdateResult.state.processedMessages[unknownUpdateKey]
  );

  // Test 8: Unknown cancellation remains retryable
  const unknownCancel = makeRecord({
    identifier: "CAP-UNKNOWN-CANCEL",
    sent: "2026-10-13T10:15:00Z",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-NOT-FOUND",
      sent: "2026-10-13T09:00:00Z"
    }]
  });

  const unknownCancelResult = applyCapMessageToState(
    createEmptyCapState(),
    unknownCancel
  );

  const unknownCancelKey =
    `${unknownCancel.sender}|${unknownCancel.identifier}|${unknownCancel.sent}`;

  check(
    "Unknown cancellation remains retryable",
    unknownCancelResult.action === "CANCELLATION_REVIEW" &&
      !unknownCancelResult.state.processedMessages[unknownCancelKey]
  );

  // Test 9: Update succeeds after its original becomes available
  const retryUpdateOriginal = applyCapMessageToState(
    unknownUpdateResult.state,
    makeRecord({
      identifier: "CAP-NOT-FOUND",
      sent: "2026-10-13T09:00:00Z",
      event: "Heavy Rain"
    })
  );

  const retryUpdateResult = applyCapMessageToState(
    retryUpdateOriginal.state,
    unknownUpdate
  );

  check(
    "Unknown update succeeds on retry",
    retryUpdateResult.action === "UPDATED" &&
      retryUpdateResult.state.activeAlerts[
        "Test-Sender|CAP-NOT-FOUND"
      ]?.event === "Severe Rain"
  );

  // Test 10: Cancellation succeeds after its original becomes available
  const retryCancelOriginal = applyCapMessageToState(
    unknownCancelResult.state,
    makeRecord({
      identifier: "CAP-NOT-FOUND",
      sent: "2026-10-13T09:00:00Z"
    })
  );

  const retryCancelResult = applyCapMessageToState(
    retryCancelOriginal.state,
    unknownCancel
  );

  check(
    "Unknown cancellation succeeds on retry",
    retryCancelResult.action === "CANCELLED" &&
      !retryCancelResult.state.activeAlerts[
        "Test-Sender|CAP-NOT-FOUND"
      ]
  );

  // Test 11: Publication-date sorting
  const sortingItems = [
    { id: "older", pubDate: "Tue, 13 Oct 2026 10:00:00 GMT" },
    { id: "newer", pubDate: "Tue, 13 Oct 2026 12:00:00 GMT" },
    { id: "missing", pubDate: "" },
    { id: "invalid", pubDate: "not-a-date" }
  ];

  const sortedItems = sortingItems
    .map((item, index) => ({
      ...item,
      publishedAt: Date.parse(item.pubDate),
      originalIndex: index
    }))
    .sort((a, b) => {
      const aTime = Number.isNaN(a.publishedAt)
        ? -Infinity
        : a.publishedAt;
      const bTime = Number.isNaN(b.publishedAt)
        ? -Infinity
        : b.publishedAt;

      return bTime - aTime || a.originalIndex - b.originalIndex;
    });

  check(
    "Publication dates sort newest first",
    sortedItems[0].id === "newer" &&
      sortedItems[1].id === "older"
  );

  check(
    "Missing and invalid dates sort last",
    sortedItems[2].id === "missing" &&
      sortedItems[3].id === "invalid"
  );

  // Test 12: Duplicate ID detection within a batch
  const duplicates = [
    makeRecord(),
    makeRecord({ sent: "2026-10-13T10:05:00Z" })
  ];

  analyzeBatch(duplicates);

  check(
    "Repeated ID is detected",
    duplicates[1].duplicateClassification ===
      "DUPLICATE ID IN THIS BATCH — REVIEW"
  );

  // Test 13: Update reference classification
  const updateForBatch = makeRecord({
    identifier: "CAP-002",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: "2026-10-13T09:00:00Z"
    }]
  });

  analyzeBatch([updateForBatch]);

  check(
    "Update links to original",
    updateForBatch.messageClassification.includes(
      "UPDATE — LINK TO ORIGINAL"
    ) &&
      updateForBatch.messageClassification.includes("CAP-ORIGINAL")
  );

  // Test 14: Cancellation reference classification
  const cancelForBatch = makeRecord({
    identifier: "CAP-003",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: "2026-10-13T09:00:00Z"
    }]
  });

  analyzeBatch([cancelForBatch]);

  check(
    "Cancellation links to original",
    cancelForBatch.messageClassification.includes(
      "CANCELLATION — REVIEW ORIGINAL"
    ) &&
      cancelForBatch.messageClassification.includes("CAP-ORIGINAL")
  );

  // Test 15: Expiry classification
  const now = Date.now();

  const expired = {
    msgType: "Alert",
    status: "Actual",
    effective: new Date(now - 7200000).toISOString(),
    expires: new Date(now - 3600000).toISOString()
  };

  check(
    "Expired alert is classified correctly",
    classifyTime(expired) === "EXPIRED"
  );

  // Test 16: Future alert classification
  const future = {
    msgType: "Alert",
    status: "Actual",
    effective: new Date(now + 3600000).toISOString(),
    expires: new Date(now + 7200000).toISOString()
  };

  check(
    "Future alert is not marked active",
    classifyTime(future) === "FUTURE — not active yet"
  );

  // Report results
  let failures = 0;

  for (const test of tests) {
    console.log(`${test.passed ? "PASS" : "FAIL"}: ${test.name}`);

    if (!test.passed) failures++;
  }

  console.log(
    `Results: ${tests.length - failures}/${tests.length} passed`
  );

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log("All synthetic CAP tests passed.");
  }
}
