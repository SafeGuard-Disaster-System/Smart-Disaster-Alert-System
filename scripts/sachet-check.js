
const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";

const MAX_CAP_CHECKS = 30;
const CONCURRENCY = 2;

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
    new RegExp(`<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safe}\\s*>`, "i")
  );
  return match ? decodeXml(match[1]) : "";
}

function getCapTag(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<(?:\\w+:)?${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${safe}\\s*>`,
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
    link: getTag(item, "link")
  }));
}

function validCapUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" &&
      url.hostname === CAP_HOST &&
      url.pathname === CAP_PATH;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SafeGuard-Disaster-Preparedness-Prototype/1.0"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function parseReferences(value) {
  if (!value) return [];

  // CAP references are commonly sender,identifier,sent triples,
  // with multiple triples separated by whitespace.
  const parts = value.trim().split(/\s+/);
  const references = [];

  for (let i = 0; i + 2 < parts.length; i += 3) {
    references.push({
      sender: parts[i],
      identifier: parts[i + 1],
      sent: parts[i + 2]
    });
  }

  return references;
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function classifyTime(cap) {
  const type = cap.msgType.toLowerCase();

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
    references: parseReferences(cap.referencesText),
    timeClassification: classifyTime(cap)
  };
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
      record.duplicateClassification = "ID FIRST SEEN IN THIS BATCH";
    }

    if (seenMessages.has(messageKey)) {
      record.messageClassification =
        "DUPLICATE MESSAGE — REVIEW";
    } else {
      record.messageClassification = "MESSAGE FIRST SEEN IN THIS BATCH";
    }

    seenIds.add(duplicateKey);
    seenMessages.add(messageKey);

    if (record.timeClassification === "UPDATE — REVIEW") {
      record.messageClassification = "UPDATE — LINK TO ORIGINAL";
    } else if (record.timeClassification === "CANCELLATION — REVIEW") {
      record.messageClassification = "CANCELLATION — REVIEW ORIGINAL";
    }

    if (record.references.length) {
      record.messageClassification +=
        `; references ${record.references.map(ref => ref.identifier).join(", ")}`;
    }
  }
}

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
  const candidates = validItems.slice(0, MAX_CAP_CHECKS);

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
    console.log(`Severity: ${record.severity}`);
    console.log(`Urgency: ${record.urgency}`);
    console.log(`Certainty: ${record.certainty}`);
    console.log(`Time: ${record.timeClassification}`);
    console.log(`Duplicate: ${record.duplicateClassification}`);
    console.log(`Message handling: ${record.messageClassification}`);

    if (record.references.length) {
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
    results.filter(r => r.timeClassification === classification).length;

  const duplicates = results.filter(
    r => r.duplicateClassification === "DUPLICATE ID IN THIS BATCH — REVIEW"
  ).length;

  const updates = count("UPDATE — REVIEW");
  const cancellations = count("CANCELLATION — REVIEW");
  const expired = count("EXPIRED");

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`CAP records checked: ${results.length}`);
  console.log(`Fetch errors: ${errors.length}`);
  console.log(`Repeated IDs in batch: ${duplicates}`);
  console.log(`Update messages: ${updates}`);
  console.log(`Cancellation messages: ${cancellations}`);
  console.log(`Expired alerts: ${expired}`);
  console.log("Firebase writes: 0");
  console.log("Automatic alerts published: 0");
  console.log("Note: duplicate detection covers this batch only.");
  console.log("Dry run complete.");
}

main().catch(error => {
  console.error("DRY RUN FAILED:", error.message);
  process.exitCode = 1;
});
