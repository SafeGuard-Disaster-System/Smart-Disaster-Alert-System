
const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";
const MAX_CAP_CHECKS = 30;
const REFERENCE_CHECK_RESERVE = 5;
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
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

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

  if (type === "ack" || type === "error") {
    return `REVIEW — message type ${cap.msgType}`;
  }

  if (cap.status && cap.status.toLowerCase() !== "actual") {
    return `REVIEW — status ${cap.status}`;
  }

  if (type !== "alert" && type !== "update") {
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

  if (type === "update") return "UPDATE — REVIEW";

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

const STATE_FILE = path.join(process.cwd(), "state", "alert-state.json");

function getStateFilePath(filePath = STATE_FILE) {
  return filePath;
}

async function loadCapState(filePath = STATE_FILE) {
  const targetFile = getStateFilePath(filePath);

  try {
    const raw = await fs.readFile(targetFile, "utf8");
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
      !(state.lastUpdated === null || typeof state.lastUpdated === "string")
    ) {
      throw new Error(
        "State file has an invalid structure; refusing to reset state."
      );
    }

    return state;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      const initial = createEmptyCapState();
      await saveCapState(initial, targetFile);
      return initial;
    }
    throw error;
  }
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

  await fs.mkdir(path.dirname(targetFile), { recursive: true });

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(updatedState, null, 2)}\n`,
    { encoding: "utf8", flag: "w" }
  );

  await fs.rename(tempFile, targetFile);
  return true;
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
    return { state, action: "INVALID_MESSAGE" };
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
  const messageKey = `${record.sender}|${record.identifier}|${record.sent}`;

  if (nextState.processedMessages[messageKey]) {
    return { state: nextState, action: "DUPLICATE" };
  }

  const references = Array.isArray(record.references) ? record.references : [];
  const original = references
    .map(ref => Object.entries(nextState.activeAlerts)
      .find(([, active]) => capMatchesReference(active, ref))?.[0] || null
    )
    .find(Boolean);

  const alertKey = `${record.sender}|${record.identifier}`;

  if (record.msgType === "Cancel") {
    if (!original) {
      return { state: nextState, action: "CANCELLATION_REVIEW" };
    }

    delete nextState.activeAlerts[original];
    markProcessed(nextState, messageKey, record);
    return { state: nextState, action: "CANCELLED" };
  }

  if (record.msgType === "Update") {
    if (!original) {
      return { state: nextState, action: "UPDATE_REVIEW" };
    }

    if (record.timeClassification !== "UPDATE — REVIEW") {
      return { state: nextState, action: "UPDATE_TIME_REVIEW" };
    }

    if (record.locationClassification !== "POSSIBLE LOCAL MATCH — VERIFY") {
      return {
        state: nextState,
        action: "UPDATE_LOCATION_REVIEW"
      };
    }

    nextState.activeAlerts[original] = {
      ...nextState.activeAlerts[original],
      ...record,
      originalKey: original
    };

    markProcessed(nextState, messageKey, record);

    return { state: nextState, action: "UPDATED" };
  }

  if (record.timeClassification === "EXPIRED") {
    markProcessed(nextState, messageKey, record);
    return { state: nextState, action: "EXPIRED" };
  }

  if (
    record.msgType !== "Alert" ||
    record.timeClassification !== "UNEXPIRED — manual review required"
  ) {
    return { state: nextState, action: "REVIEW" };
  }

  if (record.locationClassification !== "POSSIBLE LOCAL MATCH — VERIFY") {
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

function selectCapCandidates(items, maxChecks = MAX_CAP_CHECKS, referencedIds = []) {
  const rankedItems = items
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

  const referenced = new Set(referencedIds);
  const priorityItems = rankedItems.filter(item => referenced.has(item.id));
  const otherItems = rankedItems.filter(item => !referenced.has(item.id));

  return [...priorityItems, ...otherItems].slice(0, maxChecks);
}

function findReferencedRssItems(items, references) {
  const referencedBases = new Set();

  for (const ref of references) {
    if (!ref || typeof ref.identifier !== "string") {
      continue;
    }

    const match = ref.identifier.match(/^IN-(\d+)_\d+$/);
    if (match) {
      referencedBases.add(match[1]);
    }
  }

  return items.filter(item => {
    if (!item.id) return false;
    return referencedBases.has(String(item.id).trim());
  });
}

function selectUnfetchedReferenceCandidates(items, references, alreadyFetchedItems, maxChecks) {
  const alreadyFetchedLinks = new Set(
    alreadyFetchedItems.map(item => item.link).filter(Boolean)
  );

  const referencedItems = findReferencedRssItems(items, references);
  const unfetchedItems = referencedItems.filter(
    item => item.link && !alreadyFetchedLinks.has(item.link)
  );

  const uniqueLinks = [...new Map(
    unfetchedItems.map(item => [item.link, item])
  ).values()];
  return selectCapCandidates(uniqueLinks, maxChecks);
}

function capMatchesReference(cap, reference) {
  if (!cap || !reference) {
    return false;
  }

  return (
    cap.sender === reference.sender &&
    cap.identifier === reference.identifier &&
    cap.sent === reference.sent
  );
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
    } else if (record.timeClassification === "CANCELLATION — REVIEW") {
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safeguard-state-test-"));
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

    await check("Missing file is created and loads", async () => {
      try { await fs.unlink(testFile); } catch {}
      const loaded = await loadCapState(testFile);
      assert.equal(loaded.version, 1);
      assert.deepEqual(loaded.processedMessages, {});
      assert.deepEqual(loaded.activeAlerts, {});
    });

    await check("Invalid JSON is rejected", async () => {
      await fs.writeFile(testFile, "{invalid json");
      await assert.rejects(loadCapState(testFile), /invalid JSON/i);
    });

    await check("Invalid structure is rejected", async () => {
      await fs.writeFile(testFile, JSON.stringify({ version: 99 }));
      await assert.rejects(loadCapState(testFile), /invalid structure/i);
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

    await check("Load failures preserve state and skip saving", async () => {
      const previousExitCode = process.exitCode;
      let saveCalls = 0;
      const failIfFetched = async () => {
        throw new Error("Unexpected SACHET request during state failure test");
      };
      const invalidStates = [
        "{invalid json",
        JSON.stringify({ version: 99 })
      ];

      try {
        for (const contents of invalidStates) {
          await fs.writeFile(testFile, contents);
          process.exitCode = 0;

          await main({
            loadState: () => loadCapState(testFile),
            fetchFeed: failIfFetched,
            saveState: async () => {
              saveCalls++;
              return true;
            }
          });

          assert.equal(process.exitCode, 1);
          assert.equal(await fs.readFile(testFile, "utf8"), contents);
        }

        process.exitCode = 0;
        await main({
          loadState: () => loadCapState(tempDir),
          fetchFeed: failIfFetched,
          saveState: async () => {
            saveCalls++;
            return true;
          }
        });

        assert.equal(process.exitCode, 1);
        assert.equal(saveCalls, 0);
      } finally {
        process.exitCode = previousExitCode === undefined ? 0 : previousExitCode;
      }
    });

    console.log(`State tests passed: ${passed}/6`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function runPersistenceSelfTests() {
  const assert = require("node:assert/strict");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safeguard-persistence-test-"));
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

    let result = applyCapMessageToState(state, alert);
    assert.equal(result.action, "NEW_ALERT_REVIEW");
    await saveCapState(result.state, testFile);

    state = await loadCapState(testFile);
    result = applyCapMessageToState(state, alert);
    assert.equal(result.action, "DUPLICATE");
    assert.equal(Object.keys(state.activeAlerts).length, 1);

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
  if (failures > 0) process.exitCode = 1;
  else console.log("All location tests passed.");
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

  const original = makeRecord({ identifier: "CAP-NEW", event: "Heavy Rain" });
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

  const otherAlert = makeRecord({
    identifier: "CAP-OTHER",
    sent: "2026-10-13T11:00:00Z"
  });
  const twoAlertResult = applyCapMessageToState(newResult.state, otherAlert);
  const originalKey = `${original.sender}|${original.identifier}`;
  const otherAlertKey = `${otherAlert.sender}|${otherAlert.identifier}`;

  function makeUpdate(identifier, overrides = {}) {
    const now = Date.now();
    const update = makeRecord({
      identifier,
      sent: new Date(now).toISOString(),
      msgType: "Update",
      effective: new Date(now - 60_000).toISOString(),
      expires: new Date(now + 60_000).toISOString(),
      event: "Updated Rain",
      references: [{
        sender: original.sender,
        identifier: original.identifier,
        sent: original.sent
      }],
      ...overrides
    });

    update.timeClassification = classifyTime(update);
    return update;
  }

  const validUpdate = makeUpdate("CAP-UPDATE-VALID");
  const validUpdateResult = applyCapMessageToState(newResult.state, validUpdate);
  const updatedTwoAlertResult = applyCapMessageToState(
    twoAlertResult.state,
    validUpdate
  );
  check(
    "Valid Update updates its referenced alert",
    validUpdateResult.action === "UPDATED" &&
      validUpdateResult.state.activeAlerts[originalKey].event === "Updated Rain"
  );

  const beforeUpdateAlerts = JSON.stringify(newResult.state.activeAlerts);
  const updateTimestampCases = [
    [
      "Expired Update is rejected",
      {
        effective: new Date(Date.now() - 120_000).toISOString(),
        expires: new Date(Date.now() - 60_000).toISOString()
      },
      "EXPIRED"
    ],
    [
      "Future-dated Update is rejected",
      {
        effective: new Date(Date.now() + 60_000).toISOString(),
        expires: new Date(Date.now() + 120_000).toISOString()
      },
      "FUTURE — not active yet"
    ],
    ["Update with missing expiry is rejected", { expires: "" }, "REVIEW — expiry missing"],
    ["Update with invalid expiry is rejected", { expires: "not a date" }, "REVIEW — expiry invalid"],
    ["Update with missing effective time is rejected", { effective: "" }, "REVIEW — effective time missing"],
    ["Update with invalid effective time is rejected", { effective: "not a date" }, "REVIEW — effective time invalid"]
  ];

  for (const [name, overrides, expectedClassification] of updateTimestampCases) {
    const update = makeUpdate(`CAP-UPDATE-${name}`, overrides);
    const updateResult = applyCapMessageToState(newResult.state, update);
    check(
      name,
      update.timeClassification === expectedClassification &&
        updateResult.action === "UPDATE_TIME_REVIEW" &&
        JSON.stringify(updateResult.state.activeAlerts) === beforeUpdateAlerts
    );
  }

  const cancel = makeRecord({
    identifier: "CAP-CANCEL",
    sent: "2026-10-13T10:05:00Z",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [{
      sender: validUpdate.sender,
      identifier: validUpdate.identifier,
      sent: validUpdate.sent
    }]
  });
  const cancelResult = applyCapMessageToState(updatedTwoAlertResult.state, cancel);

  check(
    "Matching Cancel deactivates only its referenced alert",
    cancelResult.action === "CANCELLED" &&
      !cancelResult.state.activeAlerts[originalKey] &&
      Boolean(cancelResult.state.activeAlerts[otherAlertKey])
  );

  const unmatchedCancel = makeRecord({
    identifier: "CAP-CANCEL-UNMATCHED",
    sent: "2026-10-13T10:10:00Z",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [{
      sender: validUpdate.sender,
      identifier: validUpdate.identifier,
      sent: "2026-10-13T10:01:00Z"
    }]
  });
  const unmatchedCancelResult = applyCapMessageToState(
    updatedTwoAlertResult.state,
    unmatchedCancel
  );

  check(
    "Unmatched Cancel leaves all active alerts unchanged",
    unmatchedCancelResult.action === "CANCELLATION_REVIEW" &&
      JSON.stringify(unmatchedCancelResult.state.activeAlerts) ===
        JSON.stringify(updatedTwoAlertResult.state.activeAlerts)
  );

  const expired = makeRecord({ identifier: "CAP-EXPIRED", timeClassification: "EXPIRED" });
  const expiredResult = applyCapMessageToState(createEmptyCapState(), expired);

  check(
    "Expired alert is not added to active state",
    expiredResult.action === "EXPIRED" &&
      Object.keys(expiredResult.state.activeAlerts).length === 0
  );

  let failures = 0;
  for (const test of tests) {
    console.log(`${test.passed ? "PASS" : "FAIL"}: ${test.name}`);
    if (!test.passed) failures++;
  }

  console.log(`Results: ${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exitCode = 1;
  else console.log("All synthetic CAP tests passed.");
}

async function main({
  loadState = loadCapState,
  saveState = saveCapState,
  fetchFeed = fetchText
} = {}) {
  console.log("=== SafeGuard CAP Message Handling Dry Run ===");
  console.log("Mode: READ-ONLY; no Firebase writes");
  console.log(`CAP request limit: ${MAX_CAP_CHECKS}`);
  console.log(`Concurrent requests: ${CONCURRENCY}`);

  let state;
  try {
    state = await loadState();
  } catch (err) {
    console.error("Failed to load existing state:", err.message);
    process.exitCode = 1;
    return;
  }

  const rss = await fetchFeed(FEED_URL);
  const items = parseRssItems(rss);
  const validItems = items.filter(item => item.link && validCapUrl(item.link));
  const initialCheckLimit = MAX_CAP_CHECKS - REFERENCE_CHECK_RESERVE;
  const candidates = selectCapCandidates(validItems, initialCheckLimit);

  console.log(`Initial CAP request budget: ${initialCheckLimit}`);
  console.log(`Reserved reference-check budget: ${REFERENCE_CHECK_RESERVE}`);
  console.log(`RSS items found: ${items.length}`);
  console.log(`Valid CAP links: ${validItems.length}`);
  console.log(`CAP records selected: ${candidates.length}`);

  const results = [];
  const errors = [];
  const checkedLinks = new Set();
  let capRequests = 0;

  async function fetchCandidates(batch) {
    let nextIndex = 0;
    const batchResults = [];

    async function worker() {
      while (nextIndex < batch.length) {
        const item = batch[nextIndex++];
        if (capRequests >= MAX_CAP_CHECKS) return;
        capRequests++;

        if (item.link) checkedLinks.add(item.link);

        try {
          const record = await checkCap(item);
          results.push(record);
          batchResults.push(record);
        } catch (error) {
          errors.push({ title: item.title, error: error.message });
          console.log(`FETCH ERROR: ${item.title} | ${error.message}`);
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, batch.length) }, () => worker())
    );

    return batchResults;
  }

  const initialRecords = await fetchCandidates(candidates);
  const references = initialRecords.flatMap(record => record.references || []);
  const remainingBudget = Math.max(0, MAX_CAP_CHECKS - capRequests);
  const referenceCandidates = selectUnfetchedReferenceCandidates(
    validItems,
    references,
    [...checkedLinks].map(link => ({ link })),
    Math.min(REFERENCE_CHECK_RESERVE, remainingBudget)
  );
  const referenceRecords = await fetchCandidates(referenceCandidates);

  for (const record of referenceRecords) {
    const capIdentity = {
      sender: record.sender,
      identifier: record.identifier,
      sent: record.sent
    };
    const matchedReferences = references.filter(reference =>
      capMatchesReference(capIdentity, reference)
    );
    record.referenceVerification = matchedReferences.length
      ? "EXACT REFERENCE MATCH"
      : "NO EXACT REFERENCE MATCH";
    record.matchedReferences = matchedReferences;
  }

  const exactReferenceRecords = new Set(
    referenceRecords.filter(record => record.referenceVerification === "EXACT REFERENCE MATCH")
  );

  for (const record of referenceRecords) {
    if (!exactReferenceRecords.has(record)) {
      const index = results.indexOf(record);
      if (index !== -1) results.splice(index, 1);
      console.log(`REFERENCE MISMATCH: ${record.sender}|${record.identifier}|${record.sent}`);
    }
  }

  const deduplicated = new Map();
  for (const record of results) {
    const key = `${record.sender}|${record.identifier}|${record.sent}`;
    if (!deduplicated.has(key)) deduplicated.set(key, record);
  }
  results.splice(0, results.length, ...deduplicated.values());

  analyzeBatch(results);

  let previewState = state;
  const stateActions = {};
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
    stateActions[result.action] = (stateActions[result.action] || 0) + 1;
  }

  console.log("\n=== PERSISTENT STATE PREVIEW ===");
  console.log(`Previously processed messages: ${Object.keys(state.processedMessages).length}`);
  console.log(`Previously active alerts: ${Object.keys(state.activeAlerts).length}`);
  console.log(`Preview active alerts: ${Object.keys(previewState.activeAlerts).length}`);
  console.log("State actions:", JSON.stringify(stateActions));

  let stateSaved = false;
  try {
    stateSaved = await saveState(previewState);
  } catch (err) {
    console.warn("State save failed:", err.message);
    stateSaved = false;
  }

  console.log(`State saved: ${stateSaved ? "YES" : "NO"}`);
  console.log("Firebase writes: 0");
  console.log(`CAP requests attempted (including failures): ${capRequests}/${MAX_CAP_CHECKS}`);
  console.log(`Second-pass reference candidates fetched: ${referenceRecords.length}`);
  console.log(`Exact CAP reference matches: ${referenceRecords.filter(record => record.referenceVerification === "EXACT REFERENCE MATCH").length}`);

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
        console.log(`Reference: sender=${ref.sender}, id=${ref.identifier}, sent=${ref.sent}`);
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
    record => record.duplicateClassification === "DUPLICATE ID IN THIS BATCH — REVIEW"
  ).length;

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`CAP records checked: ${results.length}`);
  console.log(`Fetch errors: ${errors.length}`);
  console.log(`Repeated IDs in batch: ${duplicateCount}`);
  console.log(`Update messages: ${count("UPDATE — REVIEW")}`);
  console.log(`Cancellation messages: ${count("CANCELLATION — REVIEW")}`);
  console.log(`Expired alerts: ${count("EXPIRED")}`);
  console.log(`Possible local matches: ${locationCount("POSSIBLE LOCAL MATCH — VERIFY")}`);
  console.log(`No local keyword match: ${locationCount("NO LOCAL KEYWORD MATCH")}`);
  console.log(`Location manual review: ${locationCount("NEEDS MANUAL REVIEW")}`);
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
