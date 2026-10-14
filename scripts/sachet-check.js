
const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";
const MAX_CAP_CHECKS = 30;
const CONCURRENCY = 2;

const LOCAL_AREA_KEYWORDS = [
  "navi mumbai", "new mumbai", "kalamboli", "kharghar",
  "panvel", "vashi", "nerul", "belapur", "airoli",
  "ghansoli", "kopar khairane", "turbhe", "ulwe", "kamothe"
];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function getTag(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safe}\\s*>`,
      "i"
    )
  );
  return match ? decodeXml(match[1]) : "";
}

function getCapTag(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<(?:[\\w.-]+:)?${safe}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${safe}\\s*>`,
      "i"
    )
  );
  return match ? decodeXml(match[1]) : "";
}

function parseRssItems(xml) {
  const items =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

  return items.map(item => ({
    title: getTag(item, "title"),
    id: getTag(item, "guid"),
    link: getTag(item, "link"),
    pubDate: getTag(item, "pubDate")
  }));
}

function validCapUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === CAP_HOST &&
      url.pathname === CAP_PATH
    );
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SafeGuard-Disaster-Preparedness-Prototype/1.0"
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function parseReferences(value) {
  if (!value) return [];

  const references = [];
  for (const entry of value.trim().split(/\s+/)) {
    const parts = entry.split(",");
    if (parts.length >= 3) {
      references.push({
        sender: parts[0],
        identifier: parts[1],
        sent: parts.slice(2).join(",")
      });
    }
  }
  return references;
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

// Preliminary keyword screening only, not geographic verification.
function classifyLocation(area = "", title = "", description = "") {
  const normalizedArea = String(area)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,;()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !normalizedArea ||
    /isolated places|your area|your district|your region/i.test(
      normalizedArea
    )
  ) {
    return "NEEDS MANUAL REVIEW";
  }

  const containsAreaName = name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedArea);
  };

  if (LOCAL_AREA_KEYWORDS.some(containsAreaName)) {
    return "POSSIBLE LOCAL MATCH — VERIFY";
  }

  return "NO LOCAL KEYWORD MATCH";
}

function classifyTime(cap) {
  const type = (cap.msgType || "").toLowerCase();

  if (type === "cancel") return "CANCELLATION — REVIEW";
  if (type === "update") return "UPDATE — REVIEW";

  if (type === "ack" || type === "error") {
    return `REVIEW — message type ${cap.msgType}`;
  }

  if (cap.status && cap.status.toLowerCase() !== "actual") {
    return `REVIEW — status ${cap.status}`;
  }

  if (type !== "alert") {
    return `REVIEW — message type ${cap.msgType || "missing"}`;
  }

  if (!cap.expires) return "REVIEW — expiry missing";

  const expiry = parseDate(cap.expires);
  if (expiry === null) return "REVIEW — expiry invalid";
  if (expiry <= Date.now()) return "EXPIRED";

  if (!cap.effective) return "REVIEW — effective time missing";

  const effective = parseDate(cap.effective);
  if (effective === null) return "REVIEW — effective time invalid";
  if (effective > Date.now()) return "FUTURE — not active yet";

  return "UNEXPIRED — manual review required";
}

async function checkCap(item) {
  const xml = await fetchText(item.link);

  const cap = {
    identifier: getCapTag(xml, "identifier") || item.id,
    sender: getCapTag(xml, "sender"),
    sent: getCapTag(xml, "sent"),
    status: getCapTag(xml, "status"),
    msgType: getCapTag(xml, "msgType"),
    event: getCapTag(xml, "event"),
    severity: getCapTag(xml, "severity"),
    urgency: getCapTag(xml, "urgency"),
    certainty: getCapTag(xml, "certainty"),
    effective: getCapTag(xml, "effective"),
    expires: getCapTag(xml, "expires"),
    referencesText: getCapTag(xml, "references"),
    headline: getCapTag(xml, "headline"),
    description: getCapTag(xml, "description"),
    areaDesc: getCapTag(xml, "areaDesc")
  };

  return {
    title: item.title || cap.headline || "(untitled)",
    identifier: cap.identifier || "(missing ID)",
    sender: cap.sender || "(missing sender)",
    sent: cap.sent || "(missing sent time)",
    msgType: cap.msgType || "(missing type)",
    status: cap.status || "(missing status)",
    event: cap.event || "(missing event)",
    area: cap.areaDesc || "(missing area)",
    severity: cap.severity || "(missing severity)",
    urgency: cap.urgency || "(missing urgency)",
    certainty: cap.certainty || "(missing certainty)",
    effective: cap.effective,
    expires: cap.expires,
    references: parseReferences(cap.referencesText),
    locationClassification: classifyLocation(
      cap.areaDesc,
      cap.headline || item.title,
      cap.description
    ),
    timeClassification: classifyTime(cap)
  };
}

// In-memory CAP state structure. Not persistent storage.
function createEmptyCapState() {
  return {
    version: 1,
    processedMessages: {},
    activeAlerts: {},
    lastUpdated: null
  };
}


const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const STATE_FILE = path.join(
  process.cwd(),
  "state",
  "alert-state.json"
);

function getStateFilePath(filePath = STATE_FILE) {
  return filePath;
}


async function loadCapState(filePath = STATE_FILE) {
  let raw;

  try {
    raw = await fs.readFile(getStateFilePath(filePath), "utf8");
  } catch (error) {
    
  if (error.code === "ENOENT") {
    throw new Error(
      "Persistent state file is missing; refusing to initialize empty state."
    );
  }

    throw error;
  }

  let state;

  try {
    state = JSON.parse(raw);
  } catch {
    throw new Error(
      "State file contains invalid JSON; refusing to reset state."
    );
  }

  if (
    !state ||
    state.version !== 1 ||
    !state.processedMessages ||
    typeof state.processedMessages !== "object" ||
    Array.isArray(state.processedMessages) ||
    !state.activeAlerts ||
    typeof state.activeAlerts !== "object" ||
    Array.isArray(state.activeAlerts) ||
    !(
      state.lastUpdated === null ||
      typeof state.lastUpdated === "string"
    )
  ) {
    throw new Error(
      "State file has an invalid structure; refusing to reset state."
    );
  }

  return state;
}

async function saveCapState(state, filePath = STATE_FILE) {
  if (
    !state ||
    state.version !== 1 ||
    !state.processedMessages ||
    !state.activeAlerts
  ) {
    throw new Error("Refusing to save invalid CAP state.");
  }

  const updatedState = {
    ...state,
    lastUpdated: new Date().toISOString()
  };

  const targetFile = getStateFilePath(filePath);
  const tempFile = `${targetFile}.tmp`;

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(updatedState, null, 2)}\n`,
    { encoding: "utf8", flag: "w" }
  );

  await fs.rename(tempFile, targetFile);
}


function applyCapMessageToState(state, record) {
  if (
    !record ||
    typeof record.sender !== "string" ||
    !record.sender.trim() ||
    record.sender === "(missing sender)" ||
    typeof record.identifier !== "string" ||
    !record.identifier.trim() ||
    record.identifier === "(missing ID)" ||
    typeof record.sent !== "string" ||
    !record.sent.trim() ||
    record.sent === "(missing sent time)" ||
    !Number.isFinite(Date.parse(record.sent)) ||
    typeof record.msgType !== "string" ||
    !["Alert", "Update", "Cancel"].includes(
      record.msgType.trim().toLowerCase().replace(/^./, c => c.toUpperCase())
    )
  ) {
    return {
      state,
      action: "INVALID_MESSAGE"
    };
  }

  const normalizedRecord = {
    ...record,
    sender: record.sender.trim(),
    identifier: record.identifier.trim(),
    sent: record.sent.trim(),
    msgType: record.msgType.trim().toLowerCase().replace(
      /^./,
      c => c.toUpperCase()
    )
  };

  record = normalizedRecord;

  const nextState = JSON.parse(JSON.stringify(state));
  const messageKey =
    `${record.sender}|${record.identifier}|${record.sent}`;


  if (nextState.processedMessages[messageKey]) {
    return { state: nextState, action: "DUPLICATE" };
  }

  const references = Array.isArray(record.references)
    ? record.references
    : [];

  const original = references
    .map(ref => `${ref.sender}|${ref.identifier}`)
    .find(key => nextState.activeAlerts[key]);

  const alertKey = `${record.sender}|${record.identifier}`;

  // Unknown cancellations remain retryable.
  if (record.msgType === "Cancel") {
    if (!original) {
      return { state: nextState, action: "CANCELLATION_REVIEW" };
    }

    delete nextState.activeAlerts[original];
    markProcessed(nextState, messageKey, record);
    return { state: nextState, action: "CANCELLED" };
  }

  
  // Unknown updates remain retryable.
  if (record.msgType === "Update") {
    if (!original) {
      return { state: nextState, action: "UPDATE_REVIEW" };
    }

    // An update must pass location screening before changing an alert.
    if (
      record.locationClassification !==
      "POSSIBLE LOCAL MATCH — VERIFY"
    ) {
      return {
        state: nextState,
        action: "UPDATE_LOCATION_REVIEW"
      };
    }

    if (record.timeClassification === "EXPIRED") {
      delete nextState.activeAlerts[original];
    } else {
      nextState.activeAlerts[original] = {
        ...nextState.activeAlerts[original],
        ...record,
        originalKey: original
      };
    }

    markProcessed(nextState, messageKey, record);

    return {
      state: nextState,
      action: record.timeClassification === "EXPIRED"
        ? "EXPIRED"
        : "UPDATED"
    };
  }

    if (record.timeClassification === "EXPIRED") {
    markProcessed(nextState, messageKey, record);
    return { state: nextState, action: "EXPIRED" };
  }

  if (
    record.msgType !== "Alert" ||
    record.timeClassification !==
      "UNEXPIRED — manual review required"
  ) {
    return { state: nextState, action: "REVIEW" };
  }

  // Location screening is preliminary, not geographic verification.
  // Only possible local matches may enter state for manual review.
  if (
    record.locationClassification !==
    "POSSIBLE LOCAL MATCH — VERIFY"
  ) {
    return {
      state: nextState,
      action: "LOCATION_REVIEW"
    };
  }

  nextState.activeAlerts[alertKey] = {
    ...record,
    originalKey: alertKey
  };

  markProcessed(nextState, messageKey, record);
  return { state: nextState, action: "NEW_ALERT_REVIEW" };
}

function markProcessed(state, messageKey, record) {
  state.processedMessages[messageKey] = {
    sender: record.sender,
    identifier: record.identifier,
    sent: record.sent,
    msgType: record.msgType
  };
}


function selectCapCandidates(items, maxChecks = MAX_CAP_CHECKS) {
  return items
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
    })
    .slice(0, maxChecks);
}


function analyzeBatch(records) {
  const seenIds = new Set();
  const seenMessages = new Set();

  for (const record of records) {
    const duplicateKey = `${record.sender}|${record.identifier}`;
    const messageKey = `${duplicateKey}|${record.sent}`;

    record.duplicateClassification = seenIds.has(duplicateKey)
      ? "DUPLICATE ID IN THIS BATCH — REVIEW"
      : "ID FIRST SEEN IN THIS BATCH";

    record.messageClassification = seenMessages.has(messageKey)
      ? "DUPLICATE MESSAGE — REVIEW"
      : "MESSAGE FIRST SEEN IN THIS BATCH";

    seenIds.add(duplicateKey);
    seenMessages.add(messageKey);

    if (record.timeClassification === "UPDATE — REVIEW") {
      record.messageClassification = "UPDATE — LINK TO ORIGINAL";
    } else if (
      record.timeClassification === "CANCELLATION — REVIEW"
    ) {
      record.messageClassification = "CANCELLATION — REVIEW ORIGINAL";
    }

    if (record.references.length > 0) {
      record.messageClassification +=
        `; references ${record.references.map(ref => ref.identifier).join(", ")}`;
    }
  }
}


async function runStateSelfTests() {
  const assert = require("node:assert/strict");
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "safeguard-state-test-")
  );

  const testFile = path.join(tempDir, "alert-state.json");

  const validState = {
    version: 1,
    processedMessages: {},
    activeAlerts: {},
    lastUpdated: null
  };

  let passed = 0;

  async function check(name, test) {
    try {
      await test();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (error) {
      console.error(`FAIL: ${name} — ${error.message}`);
      throw error;
    }
  }

  try {
    await check("Valid state loads", async () => {
      await fs.writeFile(testFile, JSON.stringify(validState));
      const loaded = await loadCapState(testFile);
      assert.deepEqual(loaded, validState);
    });

    await check("Missing file is rejected", async () => {
      await assert.rejects(
        loadCapState(path.join(tempDir, "missing.json")),
        /missing/i
      );
    });

    await check("Invalid JSON is rejected", async () => {
      await fs.writeFile(testFile, "{invalid json");
      await assert.rejects(
        loadCapState(testFile),
        /invalid JSON/i
      );
    });

    await check("Invalid structure is rejected", async () => {
      await fs.writeFile(
        testFile,
        JSON.stringify({ version: 99 })
      );
      await assert.rejects(
        loadCapState(testFile),
        /invalid structure/i
      );
    });

    await check("Save and load round trip succeeds", async () => {
      await saveCapState(validState, testFile);
      const loaded = await loadCapState(testFile);

      assert.equal(loaded.version, 1);
      assert.deepEqual(loaded.processedMessages, {});
      assert.deepEqual(loaded.activeAlerts, {});
      assert.ok(typeof loaded.lastUpdated === "string");
      assert.ok(Number.isFinite(Date.parse(loaded.lastUpdated)));
    });

    console.log(`State tests passed: ${passed}/5`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function runPersistenceSelfTests() {
  const assert = require("node:assert/strict");
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "safeguard-persistence-test-")
  );
  const testFile = path.join(tempDir, "alert-state.json");

  try {
    let state = createEmptyCapState();
    await saveCapState(state, testFile);

    const alert = {
      sender: "Synthetic-Test-Sender",
      identifier: "SYNTHETIC-001",
      sent: "2026-10-14T10:00:00Z",
      msgType: "Alert",
      event: "Synthetic Rain",
      timeClassification: "UNEXPIRED — manual review required",
      locationClassification: "POSSIBLE LOCAL MATCH — VERIFY",
      references: []
    };

    // First run: process and persist a synthetic alert.
    let result = applyCapMessageToState(state, alert);
    assert.equal(result.action, "NEW_ALERT_REVIEW");
    await saveCapState(result.state, testFile);

    // Second run: reload state and detect the same message.
    state = await loadCapState(testFile);
    result = applyCapMessageToState(state, alert);
    assert.equal(result.action, "DUPLICATE");

    // Verify that the stored alert survived reloading.
    assert.equal(
      Object.keys(state.activeAlerts).length,
      1
    );

    console.log("PASS: Synthetic alert saved and reloaded");
    console.log("PASS: Repeated message detected across runs");
    console.log("PASS: No live alerts or Firebase writes used");
    console.log("Persistence tests passed: 3/3");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runLocationSelfTests() {
  const tests = [
    ["Navi Mumbai", "Navi Mumbai", "POSSIBLE LOCAL MATCH — VERIFY"],
    ["Kalamboli", "Kalamboli", "POSSIBLE LOCAL MATCH — VERIFY"],
    ["Panvel", "Panvel", "POSSIBLE LOCAL MATCH — VERIFY"],
    ["Bihar", "Bihar", "NO LOCAL KEYWORD MATCH"],
    ["Isolated places", "Isolated places", "NEEDS MANUAL REVIEW"],
    ["Local name only in description", "Bihar", "NO LOCAL KEYWORD MATCH"],
    ["Thane alone", "Thane", "NO LOCAL KEYWORD MATCH"],
    ["Vague area", "Your district", "NEEDS MANUAL REVIEW"],
    ["Nearby localities in area", "Kalamboli, Panvel", "POSSIBLE LOCAL MATCH — VERIFY"],
    ["Unrelated place", "An unrelated district", "NO LOCAL KEYWORD MATCH"]
  ];

  let failures = 0;
  console.log("=== SafeGuard Location Self-Tests ===");
  console.log("Mode: LOCAL TESTS ONLY");
  console.log("SACHET requests: 0");
  console.log("Firebase writes: 0");

  for (const [name, area, expected] of tests) {
    const actual = classifyLocation(area);
    const passed = actual === expected;
    console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    if (!passed) failures++;
  }

  console.log(`Results: ${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log("All location tests passed.");
  }
}

function runCapSelfTests() {
  const tests = [];
  const check = (name, passed) => tests.push({ name, passed });

function makeRecord(overrides = {}) {
  return {
    sender: "Test-Sender",
    identifier: "CAP-001",
    sent: "2026-10-13T10:00:00Z",
    msgType: "Alert",
    timeClassification: "UNEXPIRED — manual review required",
    locationClassification: "POSSIBLE LOCAL MATCH — VERIFY",
    references: [],
    ...overrides
  };
}

  console.log("=== SafeGuard Synthetic CAP Tests ===");
  console.log("Mode: LOCAL TESTS ONLY");
  console.log("SACHET requests: 0");
  console.log("Firebase writes: 0");

  const emptyState = createEmptyCapState();
  check(
    "Empty CAP state has required fields",
    emptyState.version === 1 &&
      typeof emptyState.processedMessages === "object" &&
      typeof emptyState.activeAlerts === "object" &&
      emptyState.lastUpdated === null
  );

  const original = makeRecord({
    identifier: "CAP-NEW",
    event: "Heavy Rain"
  });
  const newResult = applyCapMessageToState(createEmptyCapState(), original);

  check(
    "New alert is stored for review",
    newResult.action === "NEW_ALERT_REVIEW" &&
      Object.keys(newResult.state.activeAlerts).length === 1
  );

  check(
    "Repeated message is detected",
    applyCapMessageToState(newResult.state, original).action === "DUPLICATE"
  );

  const cancel = makeRecord({
    identifier: "CAP-CANCEL",
    sent: "2026-10-13T10:05:00Z",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-NEW",
      sent: original.sent
    }]
  });
  const cancelResult = applyCapMessageToState(newResult.state, cancel);

  check(
    "Cancellation removes original alert",
    cancelResult.action === "CANCELLED" &&
      Object.keys(cancelResult.state.activeAlerts).length === 0
  );

  const expired = makeRecord({
    identifier: "CAP-EXPIRED",
    timeClassification: "EXPIRED"
  });
  const expiredResult = applyCapMessageToState(createEmptyCapState(), expired);

  check(
    "Expired alert is not added to active state",
    expiredResult.action === "EXPIRED" &&
      Object.keys(expiredResult.state.activeAlerts).length === 0
  );

  const originalUpdateTarget = makeRecord({
    identifier: "CAP-ORIGINAL",
    event: "Heavy Rain"
  });
  const updateStart = applyCapMessageToState(
    createEmptyCapState(),
    originalUpdateTarget
  );
  const update = makeRecord({
    identifier: "CAP-UPDATE",
    sent: "2026-10-13T10:05:00Z",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    event: "Severe Rain",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: originalUpdateTarget.sent
    }]
  });
  const updateResult = applyCapMessageToState(updateStart.state, update);

  check(
    "Update modifies referenced original alert",
    updateResult.action === "UPDATED" &&
      updateResult.state.activeAlerts["Test-Sender|CAP-ORIGINAL"]?.event === "Severe Rain" &&
      Object.keys(updateResult.state.activeAlerts).length === 1
  );

  
  const nonlocalUpdate = makeRecord({
    identifier: "CAP-NONLOCAL-UPDATE",
    sent: "2026-10-13T10:06:00Z",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    locationClassification: "NO LOCAL KEYWORD MATCH",
    event: "Nonlocal event",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: originalUpdateTarget.sent
    }]
  });

  const nonlocalUpdateResult = applyCapMessageToState(
    updateStart.state,
    nonlocalUpdate
  );

  check(
    "Nonlocal update cannot overwrite original alert",
    nonlocalUpdateResult.action === "UPDATE_LOCATION_REVIEW" &&
      nonlocalUpdateResult.state.activeAlerts[
        "Test-Sender|CAP-ORIGINAL"
      ]?.event === "Heavy Rain" &&
      !nonlocalUpdateResult.state.processedMessages[
        `${nonlocalUpdate.sender}|${nonlocalUpdate.identifier}|${nonlocalUpdate.sent}`
      ]
  );

  const invalidMessageResult = applyCapMessageToState(
    updateStart.state,
    makeRecord({ identifier: "(missing ID)" })
  );

  check(
    "Missing identifier is rejected without changing state",
    invalidMessageResult.action === "INVALID_MESSAGE" &&
      invalidMessageResult.state === updateStart.state
  );

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

  check(
    "Unknown update remains retryable until original is available",
    unknownUpdateResult.action === "UPDATE_REVIEW" &&
      !unknownUpdateResult.state.processedMessages[unknownUpdateKey] &&
      Object.keys(unknownUpdateResult.state.activeAlerts).length === 0
  );

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
      retryUpdateResult.state.activeAlerts["Test-Sender|CAP-NOT-FOUND"]?.event === "Severe Rain"
  );

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
      !retryCancelResult.state.activeAlerts["Test-Sender|CAP-NOT-FOUND"]
  );

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
      const aTime = Number.isNaN(a.publishedAt) ? -Infinity : a.publishedAt;
      const bTime = Number.isNaN(b.publishedAt) ? -Infinity : b.publishedAt;
      return bTime - aTime || a.originalIndex - b.originalIndex;
    });

  check(
    "Publication dates sort newest first",
    sortedItems[0].id === "newer" && sortedItems[1].id === "older"
  );
  check(
    "Missing and invalid dates sort last",
    sortedItems[2].id === "missing" && sortedItems[3].id === "invalid"
  );

  
  const candidateItems = Array.from({ length: 35 }, (_, index) => ({
    id: `CAP-${index + 1}`,
    pubDate: new Date(
      Date.UTC(2026, 9, 14, 12, index)
    ).toUTCString()
  }));

  const selectedCandidates = selectCapCandidates(candidateItems, 30);

  check(
    "Candidate selection respects the request limit",
    selectedCandidates.length === 30
  );

  check(
    "Candidate selection keeps newest entries first",
    selectedCandidates[0].id === "CAP-35" &&
      selectedCandidates[29].id === "CAP-6"
  );


  const duplicates = [
    makeRecord(),
    makeRecord({ sent: "2026-10-13T10:05:00Z" })
  ];
  analyzeBatch(duplicates);
  check(
    "Repeated ID is detected",
    duplicates[1].duplicateClassification === "DUPLICATE ID IN THIS BATCH — REVIEW"
  );

  const batchUpdate = makeRecord({
    identifier: "CAP-002",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: "2026-10-13T09:00:00Z"
    }]
  });
  analyzeBatch([batchUpdate]);
  check(
    "Update links to original",
    batchUpdate.messageClassification.includes("UPDATE — LINK TO ORIGINAL") &&
      batchUpdate.messageClassification.includes("CAP-ORIGINAL")
  );

  const batchCancel = makeRecord({
    identifier: "CAP-003",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [{
      sender: "Test-Sender",
      identifier: "CAP-ORIGINAL",
      sent: "2026-10-13T09:00:00Z"
    }]
  });
  analyzeBatch([batchCancel]);
  check(
    "Cancellation links to original",
    batchCancel.messageClassification.includes("CANCELLATION — REVIEW ORIGINAL") &&
      batchCancel.messageClassification.includes("CAP-ORIGINAL")
  );

  const now = Date.now();
  check(
    "Expired alert is classified correctly",
    classifyTime({
      msgType: "Alert",
      status: "Actual",
      effective: new Date(now - 7200000).toISOString(),
      expires: new Date(now - 3600000).toISOString()
    }) === "EXPIRED"
  );
  check(
    "Future alert is not marked active",
    classifyTime({
      msgType: "Alert",
      status: "Actual",
      effective: new Date(now + 3600000).toISOString(),
      expires: new Date(now + 7200000).toISOString()
    }) === "FUTURE — not active yet"
  );

  let failures = 0;
  for (const test of tests) {
    console.log(`${test.passed ? "PASS" : "FAIL"}: ${test.name}`);
    if (!test.passed) failures++;
  }

  console.log(`Results: ${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log("All synthetic CAP tests passed.");
  }
}

// Normal SACHET dry run: read-only; no Firebase writes.
async function main() {
  console.log("=== SafeGuard CAP Message Handling Dry Run ===");
  console.log("Mode: READ-ONLY; no Firebase writes");
  console.log(`CAP request limit: ${MAX_CAP_CHECKS}`);
  console.log(`Concurrent requests: ${CONCURRENCY}`);

  const rss = await fetchText(FEED_URL);
  const items = parseRssItems(rss);
  const validItems = items.filter(
    item => item.link && validCapUrl(item.link)
  );

  const candidates = validItems
    .map((item, index) => ({
      ...item,
      publishedAt: Date.parse(item.pubDate),
      originalIndex: index
    }))
    .sort((a, b) => {
      const aTime = Number.isNaN(a.publishedAt) ? -Infinity : a.publishedAt;
      const bTime = Number.isNaN(b.publishedAt) ? -Infinity : b.publishedAt;
      return bTime - aTime || a.originalIndex - b.originalIndex;
    })
    .slice(0, MAX_CAP_CHECKS);

  console.log(`RSS items found: ${items.length}`);
  console.log(`Valid CAP links: ${validItems.length}`);
  console.log(`CAP records selected: ${candidates.length}`);

  const results = [];
  const errors = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < candidates.length) {
      const item = candidates[nextIndex++];
      try {
        results.push(await checkCap(item));
      } catch (error) {
        errors.push({ title: item.title, error: error.message });
        console.log(`FETCH ERROR: ${item.title} | ${error.message}`);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, candidates.length) },
      () => worker()
    )
  );

  analyzeBatch(results);

  // Persistent-state preview only: do not save or publish alerts.
  const state = await loadCapState();
  let previewState = state;
  const stateActions = {};

  // Process older CAP messages first so referenced originals in this batch
  // are available before their updates or cancellations.
  const stateProcessingRecords = [...results].sort((a, b) => {
    const aSent = Date.parse(a.sent);
    const bSent = Date.parse(b.sent);
    const aTime = Number.isNaN(aSent) ? Infinity : aSent;
    const bTime = Number.isNaN(bSent) ? Infinity : bSent;
    return aTime - bTime;
  });

  for (const record of stateProcessingRecords) {
    const result = applyCapMessageToState(previewState, record);
    previewState = result.state;

    stateActions[result.action] =
      (stateActions[result.action] || 0) + 1;
  }

  console.log("\n=== PERSISTENT STATE PREVIEW ===");
  console.log(`Previously processed messages: ${Object.keys(state.processedMessages).length}`);
  console.log(`Previously active alerts: ${Object.keys(state.activeAlerts).length}`);
  console.log(`Preview active alerts: ${Object.keys(previewState.activeAlerts).length}`);
  console.log("State actions:", JSON.stringify(stateActions));
  console.log("State saved: NO");
  console.log("Firebase writes: 0");

  for (const record of results) {
    console.log("\n--- CAP RECORD ---");
    console.log(`Title: ${record.title}`);
    console.log(`ID: ${record.identifier}`);
    console.log(`Sender: ${record.sender}`);
    console.log(`Sent: ${record.sent}`);
    console.log(`Type: ${record.msgType}`);
    console.log(`Status: ${record.status}`);
    console.log(`Event: ${record.event}`);
    console.log(`Area: ${record.area}`);
    console.log(`Location check: ${record.locationClassification}`);
    console.log(`Severity: ${record.severity}`);
    console.log(`Urgency: ${record.urgency}`);
    console.log(`Certainty: ${record.certainty}`);
    console.log(`Time: ${record.timeClassification}`);
    console.log(`Duplicate: ${record.duplicateClassification}`);
    console.log(`Message handling: ${record.messageClassification}`);

    if (record.references.length > 0) {
      for (const ref of record.references) {
        console.log(
          `Reference: sender=${ref.sender}, id=${ref.identifier}, sent=${ref.sent}`
        );
      }
    } else {
      console.log("References: none provided");
    }
  }

  const count = classification =>
    results.filter(record => record.timeClassification === classification).length;
  const locationCount = classification =>
    results.filter(record => record.locationClassification === classification).length;
  const duplicateCount = results.filter(
    record =>
      record.duplicateClassification === "DUPLICATE ID IN THIS BATCH — REVIEW"
  ).length;

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`CAP records checked: ${results.length}`);
  console.log(`Fetch errors: ${errors.length}`);
  console.log(`Repeated IDs in batch: ${duplicateCount}`);
  console.log(`Update messages: ${count("UPDATE — REVIEW")}`);
  console.log(`Cancellation messages: ${count("CANCELLATION — REVIEW")}`);
  console.log(`Expired alerts: ${count("EXPIRED")}`);
  console.log(
    `Possible local matches: ${locationCount("POSSIBLE LOCAL MATCH — VERIFY")}`
  );
  console.log(
    `No local keyword match: ${locationCount("NO LOCAL KEYWORD MATCH")}`
  );
  console.log(
    `Location manual review: ${locationCount("NEEDS MANUAL REVIEW")}`
  );
  console.log("Firebase writes: 0");
  console.log("Automatic alerts published: 0");
  console.log("Note: duplicate detection covers this batch only.");
  console.log("Location results are keyword screening, not geographic verification.");
  console.log("Dry run complete.");
}


if (process.argv.includes("--test-state")) {
  runStateSelfTests().catch(error => {
    console.error("STATE TESTS FAILED:", error.message);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--test-persistence")) {
  runPersistenceSelfTests().catch(error => {
    console.error("PERSISTENCE TESTS FAILED:", error.message);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--test-location")) {
  runLocationSelfTests();
} else if (process.argv.includes("--test-cap")) {
  runCapSelfTests();
} else {
  main().catch(error => {
    console.error("DRY RUN FAILED:", error.message);
    process.exitCode = 1;
  });
}

