const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";

// Keep requests low to avoid overloading the public feed.
const MAX_CAP_CHECKS = 10;
const CONCURRENCY = 2;

const MAHARASHTRA_TERMS = [
  "maharashtra",
  "mumbai",
  "navi mumbai",
  "thane",
  "palghar",
  "raigad",
  "ratnagiri",
  "sindhudurg",
  "pune",
  "nashik",
  "nagpur",
  "kolhapur",
  "satara",
  "sangli",
  "solapur",
  "ahilyanagar",
  "ahmednagar",
  "dhule",
  "nandurbar",
  "jalgaon",
  "chhatrapati sambhajinagar",
  "aurangabad",
  "jalna",
  "beed",
  "latur",
  "dharashiv",
  "osmanabad",
  "nanded",
  "parbhani",
  "hingoli",
  "akola",
  "amravati",
  "buldhana",
  "washim",
  "yavatmal",
  "wardha",
  "bhandara",
  "gondia",
  "chandrapur",
  "gadchiroli",
  "baramati",
  "kalyan",
  "dombivli",
  "ulhasnagar",
  "badlapur",
  "panvel",
  "vasai",
  "virar"
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
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, "i")
  );
  return match ? decodeXml(match[1]) : "";
}

function getCapTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<(?:\\w+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${escaped}\\s*>`,
      "i"
    )
  );
  return match ? decodeXml(match[1]) : "";
}

function matchesMaharashtra(text) {
  const normalized = text.toLowerCase();
  return MAHARASHTRA_TERMS.filter(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(normalized);
  });
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function classifyTime(cap) {
  const now = Date.now();

  if (cap.status && cap.status.toLowerCase() !== "actual") {
    return `REVIEW — status ${cap.status}`;
  }

  const type = cap.msgType.toLowerCase();

  if (["cancel", "ack", "error"].includes(type)) {
    return `REVIEW — message type ${cap.msgType}`;
  }

  if (type === "update") {
    return "REVIEW — update to an existing alert";
  }

  if (!["alert", "test", "exercise"].includes(type)) {
    return `REVIEW — unknown message type ${cap.msgType || "(missing)"}`;
  }

  if (!cap.expires) return "REVIEW — expiry missing";
  const expiry = parseDate(cap.expires);

  if (expiry === null) return "REVIEW — expiry date invalid";
  if (expiry <= now) return "EXPIRED";

  if (!cap.effective) return "REVIEW — effective time missing";
  const effective = parseDate(cap.effective);

  if (effective === null) return "REVIEW — effective date invalid";
  if (effective > now) return "FUTURE — not active yet";

  return "UNEXPIRED — manual review required";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SafeGuard-Disaster-Preparedness-Prototype/1.0" }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function parseRssItems(xml) {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

  return items.map(item => ({
    title: getTag(item, "title"),
    pubDate: getTag(item, "pubDate"),
    id: getTag(item, "guid"),
    link: getTag(item, "link")
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

async function checkCap(item) {
  const xml = await fetchText(item.link);

  const cap = {
    identifier: getCapTag(xml, "identifier"),
    status: getCapTag(xml, "status"),
    msgType: getCapTag(xml, "msgType"),
    event: getCapTag(xml, "event"),
    severity: getCapTag(xml, "severity"),
    urgency: getCapTag(xml, "urgency"),
    certainty: getCapTag(xml, "certainty"),
    effective: getCapTag(xml, "effective"),
    onset: getCapTag(xml, "onset"),
    expires: getCapTag(xml, "expires"),
    headline: getCapTag(xml, "headline"),
    description: getCapTag(xml, "description"),
    areaDesc: getCapTag(xml, "areaDesc")
  };

  const locationText = [
    item.title,
    cap.event,
    cap.headline,
    cap.description,
    cap.areaDesc
  ].join(" ");

  const locationMatches = matchesMaharashtra(locationText);

  return {
    title: item.title || cap.headline || "(untitled)",
    identifier: cap.identifier || item.id || "(missing ID)",
    event: cap.event || "(missing event)",
    areaDesc: cap.areaDesc || "(missing area)",
    severity: cap.severity || "(missing severity)",
    urgency: cap.urgency || "(missing urgency)",
    certainty: cap.certainty || "(missing certainty)",
    locationMatches,
    timeClassification: classifyTime(cap),
    locationClassification: locationMatches.length
      ? `MAHARASHTRA MENTION — REVIEW (${locationMatches.join(", ")})`
      : "NO MAHARASHTRA KEYWORD — LOCATION STILL UNCONFIRMED"
  };
}

async function main() {
  console.log("=== SafeGuard Maharashtra Alert Dry Run ===");
  console.log("Mode: READ-ONLY; no Firebase writes");
  console.log(`Maximum CAP detail requests: ${MAX_CAP_CHECKS}`);
  console.log(`Request concurrency: ${CONCURRENCY}`);

  const rss = await fetchText(FEED_URL);
  const items = parseRssItems(rss);

  console.log(`RSS items found: ${items.length}`);

  const missingTitles = items.filter(item => !item.title).length;
  const missingIds = items.filter(item => !item.id).length;
  const missingLinks = items.filter(item => !item.link).length;

  console.log(`Missing titles: ${missingTitles}`);
  console.log(`Missing IDs: ${missingIds}`);
  console.log(`Missing links: ${missingLinks}`);

  const titleMatches = items.filter(item =>
    matchesMaharashtra(item.title).length > 0
  );

  console.log(`RSS titles with Maharashtra keywords: ${titleMatches.length}`);

  for (const item of titleMatches) {
    console.log(
      `TITLE MATCH: ${item.title} | ${matchesMaharashtra(item.title).join(", ")}`
    );
  }

  const candidates = items.filter(item => {
    if (!item.link || !validCapUrl(item.link)) return false;

    const titleMatch = matchesMaharashtra(item.title).length > 0;

    // Only CAP-fetch items whose title suggests Maharashtra or whose title
    // does not provide enough location information.
    // This is a cautious prototype, not a complete geographic search.
    return titleMatch || !item.title;
  }).slice(0, MAX_CAP_CHECKS);

  console.log(`CAP candidates selected: ${candidates.length}`);
  console.log(
    "Note: title-only candidate selection can miss alerts whose titles omit locations."
  );

  const results = [];
  const errors = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const item = candidates[index];

      try {
        const result = await checkCap(item);
        results.push(result);

        console.log("\n--- CAP RESULT ---");
        console.log(`Title: ${result.title}`);
        console.log(`ID: ${result.identifier}`);
        console.log(`Event: ${result.event}`);
        console.log(`Area: ${result.areaDesc}`);
        console.log(`Severity: ${result.severity}`);
        console.log(`Urgency: ${result.urgency}`);
        console.log(`Certainty: ${result.certainty}`);
        console.log(`Time: ${result.timeClassification}`);
        console.log(`Location: ${result.locationClassification}`);
      } catch (error) {
        errors.push({ title: item.title, message: error.message });
        console.log(`CAP FETCH ERROR: ${item.title} | ${error.message}`);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, candidates.length) },
      () => worker()
    )
  );

  const matched = results.filter(result => result.locationMatches.length > 0);
  const expired = results.filter(
    result => result.timeClassification === "EXPIRED"
  );
  const unclear = results.filter(result => result.locationMatches.length === 0);

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`Title keyword matches: ${titleMatches.length}`);
  console.log(`CAP details checked: ${results.length}`);
  console.log(`CAP fetch errors: ${errors.length}`);
  console.log(`Maharashtra mentions requiring review: ${matched.length}`);
  console.log(`No Maharashtra keyword / location unconfirmed: ${unclear.length}`);
  console.log(`Expired records: ${expired.length}`);
  console.log("Firebase writes: 0");
  console.log("Automatic alerts published: 0");
  console.log("Dry run complete.");
}

main().catch(error => {
  console.error("DRY RUN FAILED:", error.message);
  process.exitCode = 1;
});
