
const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";

const MAX_CAP_CHECKS = 30;
const CONCURRENCY = 2;

// Preliminary screening only. This does not verify geographic boundaries.
const LOCAL_AREA_KEYWORDS = [
  "navi mumbai",
  "new mumbai",
  "kalamboli",
  "kharghar",
  "panvel",
  "vashi",
  "nerul",
  "belapur",
  "airoli",
  "ghansoli",
  "kopar khairane",
  "turbhe",
  "ulwe",
  "kamothe"
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
  const entries = value.trim().split(/\s+/);

  for (const entry of entries) {
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

// --------------------------------------------------
// IMPROVED LOCATION SCREENING
// Uses the CAP area field, not just the description.
// This is NOT geographic verification.
// --------------------------------------------------

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

  // Match complete locality names to reduce accidental partial matches.
  // Title and description are deliberately not used to confirm locality.
  const containsAreaName = name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    return pattern.test(normalizedArea);
  };

  if (LOCAL_AREA_KEYWORDS.some(containsAreaName)) {
    return "POSSIBLE LOCAL MATCH — VERIFY";
  }

  // "Thane" alone is not proof that an alert affects Navi Mumbai.
  return "NO LOCAL KEYWORD MATCH";
}

function classifyTime(cap) {
  const type = (cap.msgType || "").toLowerCase();

  if (type === "cancel") {
    return "CANCELLATION — REVIEW";
  }

  if (type === "update") {
    return "UPDATE — REVIEW";
  }

  if (type === "ack" || type === "error") {
    return `REVIEW — message type ${cap.msgType}`;
  }

  if (cap.status && cap.status.toLowerCase() !== "actual") {
    return `REVIEW — status ${cap.status}`;
  }

  if (type !== "alert") {
    return `REVIEW — message type ${cap.msgType || "missing"}`;
  }

  if (!cap.expires) {
    return "REVIEW — expiry missing";
  }

  const expiry = parseDate(cap.expires);

  if (expiry === null) {
    return "REVIEW — expiry invalid";
  }

  if (expiry <= Date.now()) {
    return "EXPIRED";
  }

  if (!cap.effective) {
    return "REVIEW — effective time missing";
  }

  const effective = parseDate(cap.effective);

  if (effective === null) {
    return "REVIEW — effective time invalid";
  }

  if (effective > Date.now()) {
    return "FUTURE — not active yet";
  }

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

// --------------------------------------------------
// PERSISTENT CAP STATE — STRUCTURE ONLY
// No file writes, network requests, or Firebase access
// --------------------------------------------------

function createEmptyCapState() {
  return {
    version: 1,
    processedMessages: {},
    activeAlerts: {},
    lastUpdated: null
  };
}


function applyCapMessageToState(state, record) {
  const nextState = JSON.parse(JSON.stringify(state));
  const messageKey = `${record.sender}|${record.identifier}|${record.sent}`;

  if (nextState.processedMessages[messageKey]) {
    return { state: nextState, action: "DUPLICATE" };
  }

  nextState.processedMessages[messageKey] = {
    sender: record.sender,
    identifier: record.identifier,
    sent: record.sent,
    msgType: record.msgType
  };

  const references = Array.isArray(record.references)
    ? record.references
    : [];

  const original = references
    .map(ref => `${ref.sender}|${ref.identifier}`)
    .find(key => nextState.activeAlerts[key]);

  const alertKey = `${record.sender}|${record.identifier}`;

  if (record.msgType === "Cancel") {
    if (original) {
      delete nextState.activeAlerts[original];
    }
    return {
      state: nextState,
      action: original ? "CANCELLED" : "CANCELLATION_REVIEW"
    };
  }

  if (record.msgType === "Update") {
    if (!original) {
      return { state: nextState, action: "UPDATE_REVIEW" };
    }

    if (record.timeClassification === "EXPIRED") {
      delete nextState.activeAlerts[original];
      return { state: nextState, action: "EXPIRED" };
    }

    nextState.activeAlerts[original] = {
      ...nextState.activeAlerts[original],
      ...record,
      originalKey: original
    };

    return { state: nextState, action: "UPDATED" };
  }

  
  if (record.timeClassification === "EXPIRED") {
    return { state: nextState, action: "EXPIRED" };
  }

  if (
    record.msgType !== "Alert" ||
    record.timeClassification !== "UNEXPIRED — manual review required"
  ) {
    return { state: nextState, action: "REVIEW" };
  }


  nextState.activeAlerts[alertKey] = {
    ...record,
    originalKey: alertKey
  };

  return { state: nextState, action: "NEW_ALERT_REVIEW" };
}

function analyzeBatch(records) {
  const seenIds = new Set();
  const seenMessages = new Set();

  for (const record of records) {
    const duplicateKey = `${record.sender}|${record.identifier}`;
    const messageKey = `${duplicateKey}|${record.sent}`;

    if (seenIds.has(duplicateKey)) {
      record.duplicateClassification =
        "DUPLICATE ID IN THIS BATCH — REVIEW";
    } else {
      record.duplicateClassification =
        "ID FIRST SEEN IN THIS BATCH";
    }

    if (seenMessages.has(messageKey)) {
      record.messageClassification = "DUPLICATE MESSAGE — REVIEW";
    } else {
      record.messageClassification = "MESSAGE FIRST SEEN IN THIS BATCH";
    }

    seenIds.add(duplicateKey);
    seenMessages.add(messageKey);

    if (record.timeClassification === "UPDATE — REVIEW") {
      record.messageClassification = "UPDATE — LINK TO ORIGINAL";
    } else if (
      record.timeClassification === "CANCELLATION — REVIEW"
    ) {
      record.messageClassification =
        "CANCELLATION — REVIEW ORIGINAL";
    }

    if (record.references.length > 0) {
      record.messageClassification +=
        `; references ${record.references
          .map(ref => ref.identifier)
          .join(", ")}`;
    }
  }
}

// --------------------------------------------------
// LOCATION SELF-TESTS: synthetic data only
// --------------------------------------------------

function runLocationSelfTests() {
  const tests = [
    {
      name: "Navi Mumbai",
      area: "Navi Mumbai",
      expected: "POSSIBLE LOCAL MATCH — VERIFY"
    },
    {
      name: "Kalamboli",
      area: "Kalamboli",
      expected: "POSSIBLE LOCAL MATCH — VERIFY"
    },
    {
      name: "Panvel",
      area: "Panvel",
      expected: "POSSIBLE LOCAL MATCH — VERIFY"
    },
    {
      name: "Bihar",
      area: "Bihar",
      expected: "NO LOCAL KEYWORD MATCH"
    },
    {
      name: "Isolated places",
      area: "Isolated places",
      expected: "NEEDS MANUAL REVIEW"
    },
    {
      name: "Local name only in description",
      area: "Bihar",
      description: "Flood warning mentions Navi Mumbai",
      expected: "NO LOCAL KEYWORD MATCH"
    },
    {
      name: "Thane alone",
      area: "Thane",
      expected: "NO LOCAL KEYWORD MATCH"
    },
    {
      name: "Vague area",
      area: "Your district",
      expected: "NEEDS MANUAL REVIEW"
    },
    {
      name: "Nearby localities in area",
      area: "Kalamboli, Panvel",
      expected: "POSSIBLE LOCAL MATCH — VERIFY"
    },
    {
      name: "Unrelated place containing a short name",
      area: "An unrelated district",
      expected: "NO LOCAL KEYWORD MATCH"
    }
  ];

  let failures = 0;

  console.log("=== SafeGuard Location Self-Tests ===");
  console.log("Mode: LOCAL TESTS ONLY");
  console.log("SACHET requests: 0");
  console.log("Firebase writes: 0");

  for (const test of tests) {
    const actual = classifyLocation(
      test.area,
      test.title || "",
      test.description || ""
    );

    const passed = actual === test.expected;

    console.log(`${passed ? "PASS" : "FAIL"}: ${test.name}`);
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Actual:   ${actual}`);

    if (!passed) failures++;
  }

  console.log(
    `Results: ${tests.length - failures}/${tests.length} passed`
  );

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log("All location tests passed.");
  }
}

// --------------------------------------------------
// SYNTHETIC CAP TESTS: no network or Firebase access
// --------------------------------------------------

function runCapSelfTests() {
  const tests = [];

  // Test: empty CAP state structure
  const emptyState = createEmptyCapState();

  tests.push({
    name: "Empty CAP state has required fields",
    passed:
      emptyState.version === 1 &&
      typeof emptyState.processedMessages === "object" &&
      typeof emptyState.activeAlerts === "object" &&
      emptyState.lastUpdated === null
  });

  
  // Test: new alert requires review
  const stateStart = createEmptyCapState();
  const testAlert = {
    sender: "Test-Sender",
    identifier: "CAP-NEW",
    sent: "2026-10-13T10:00:00Z",
    msgType: "Alert",
    timeClassification: "UNEXPIRED — manual review required",
    references: []
  };

  const newResult = applyCapMessageToState(stateStart, testAlert);

  tests.push({
    name: "New alert is stored for review",
    passed:
      newResult.action === "NEW_ALERT_REVIEW" &&
      Object.keys(newResult.state.activeAlerts).length === 1
  });

  // Test: repeated message is ignored
  const duplicateResult = applyCapMessageToState(
    newResult.state,
    testAlert
  );

  tests.push({
    name: "Repeated message is detected",
    passed: duplicateResult.action === "DUPLICATE"
  });

  // Test: cancellation removes the referenced alert
  const cancelResult = applyCapMessageToState(
    newResult.state,
    {
      sender: "Test-Sender",
      identifier: "CAP-CANCEL",
      sent: "2026-10-13T10:05:00Z",
      msgType: "Cancel",
      timeClassification: "CANCELLATION — REVIEW",
      references: [{
        sender: "Test-Sender",
        identifier: "CAP-NEW",
        sent: "2026-10-13T10:00:00Z"
      }]
    }
  );

  tests.push({
    name: "Cancellation removes original alert",
    passed:
      cancelResult.action === "CANCELLED" &&
      Object.keys(cancelResult.state.activeAlerts).length === 0
  });

  
  // Test: expired alerts are never added to active state
  const expiredState = createEmptyCapState();

  const expiredStateResult = applyCapMessageToState(
    expiredState,
    {
      sender: "Test-Sender",
      identifier: "CAP-EXPIRED",
      sent: "2026-10-13T10:10:00Z",
      msgType: "Alert",
      timeClassification: "EXPIRED",
      references: []
    }
  );

  tests.push({
    name: "Expired alert is not added to active state",
    passed:
      expiredStateResult.action === "EXPIRED" &&
      Object.keys(expiredStateResult.state.activeAlerts).length === 0
  });

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

  function check(name, passed) {
    tests.push({ name, passed });
  }

  console.log("=== SafeGuard Synthetic CAP Tests ===");
  console.log("Mode: LOCAL TESTS ONLY");
  console.log("SACHET requests: 0");
  console.log("Firebase writes: 0");

  
  // Test 0: publication-date sorting
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

  
  // Test 1: duplicate ID
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

  // Test 2: update references its original
  const update = makeRecord({
    identifier: "CAP-002",
    msgType: "Update",
    timeClassification: "UPDATE — REVIEW",
    references: [
      {
        sender: "Test-Sender",
        identifier: "CAP-ORIGINAL",
        sent: "2026-10-13T09:00:00Z"
      }
    ]
  });

  analyzeBatch([update]);

  check(
    "Update links to original",
    update.messageClassification.includes("UPDATE — LINK TO ORIGINAL") &&
      update.messageClassification.includes("CAP-ORIGINAL")
  );

  // Test 3: cancellation references its original
  const cancellation = makeRecord({
    identifier: "CAP-003",
    msgType: "Cancel",
    timeClassification: "CANCELLATION — REVIEW",
    references: [
      {
        sender: "Test-Sender",
        identifier: "CAP-ORIGINAL",
        sent: "2026-10-13T09:00:00Z"
      }
    ]
  });

  analyzeBatch([cancellation]);

  check(
    "Cancellation links to original",
    cancellation.messageClassification.includes(
      "CANCELLATION — REVIEW ORIGINAL"
    ) &&
      cancellation.messageClassification.includes("CAP-ORIGINAL")
  );

  // Test 4: expired alert
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

  // Test 5: future alert
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

// --------------------------------------------------
// NORMAL SACHET DRY RUN: read-only
// --------------------------------------------------

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
      const aTime = Number.isNaN(a.publishedAt)
        ? -Infinity
        : a.publishedAt;
      const bTime = Number.isNaN(b.publishedAt)
        ? -Infinity
        : b.publishedAt;

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
        errors.push({
          title: item.title,
          error: error.message
        });

        console.log(
          `FETCH ERROR: ${item.title} | ${error.message}`
        );
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
          `Reference: sender=${ref.sender}, ` +
          `id=${ref.identifier}, sent=${ref.sent}`
        );
      }
    } else {
      console.log("References: none provided");
    }
  }

  const count = classification =>
    results.filter(
      record => record.timeClassification === classification
    ).length;

  const locationCount = classification =>
    results.filter(
      record => record.locationClassification === classification
    ).length;

  const duplicates = results.filter(
    record =>
      record.duplicateClassification ===
      "DUPLICATE ID IN THIS BATCH — REVIEW"
  ).length;

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`CAP records checked: ${results.length}`);
  console.log(`Fetch errors: ${errors.length}`);
  console.log(`Repeated IDs in batch: ${duplicates}`);
  console.log(`Update messages: ${count("UPDATE — REVIEW")}`);
  console.log(
    `Cancellation messages: ${count("CANCELLATION — REVIEW")}`
  );
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
  console.log(
    "Location results are keyword screening, not geographic verification."
  );
  console.log("Dry run complete.");
}

// Choose exactly one mode. Tests never call main().
if (process.argv.includes("--test-location")) {
  runLocationSelfTests();
} else if (process.argv.includes("--test-cap")) {
  runCapSelfTests();
} else {
  main().catch(error => {
    console.error("DRY RUN FAILED:", error.message);
    process.exitCode = 1;
  });
}
