const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) =>
      String.fromCodePoint(parseInt(num, 10))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extract a normal RSS tag, including tags with attributes.
function getTag(xml, tag) {
  const name = escapeRegex(tag);

  const regex = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`,
    "i"
  );

  const match = xml.match(regex);
  return match ? decodeXml(match[1]) : "";
}

// Extract a CAP tag even when it has a namespace prefix,
// such as cap:event or cap:severity.
function getCapTag(xml, tag) {
  const name = escapeRegex(tag);

  const regex = new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`,
    "i"
  );

  const match = xml.match(regex);
  return match ? decodeXml(match[1]) : "";
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SafeGuard-Disaster-Alert-System/1.0",
      Accept: "application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(20000),
  });

  console.log(`${label} HTTP status:`, response.status);

  if (!response.ok) {
    throw new Error(`${label} request failed: HTTP ${response.status}`);
  }

  return response.text();
}

async function main() {
  console.log("=== SafeGuard SACHET Feed Check ===");

  // 1. Retrieve the RSS feed.
  const xml = await fetchText(FEED_URL, "RSS");
  const items =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

  console.log("Feed retrieved successfully");
  console.log("Total RSS items:", items.length);

  if (items.length === 0) {
    throw new Error("No RSS items found. Check the feed format.");
  }

  // 2. Extract basic details from each RSS item.
  const alerts = items.map((item) => ({
    title: getTag(item, "title"),
    publishedAt: getTag(item, "pubDate"),
    id: getTag(item, "guid"),
    link: getTag(item, "link"),
  }));

  const missingTitles = alerts.filter((alert) => !alert.title).length;
  const missingIds = alerts.filter((alert) => !alert.id).length;
  const missingLinks = alerts.filter((alert) => !alert.link).length;

  console.log("Missing titles:", missingTitles);
  console.log("Missing IDs:", missingIds);
  console.log("Missing CAP links:", missingLinks);

  console.log("\n=== Sample RSS Alerts ===");
  console.log(JSON.stringify(alerts.slice(0, 3), null, 2));

  // 3. Fetch the CAP XML for the first alert with a valid SACHET link.
  const firstAlert = alerts.find((alert) => {
    if (!alert.link) return false;

    try {
      const url = new URL(alert.link);
      return (
        url.protocol === "https:" &&
        url.hostname === "sachet.ndma.gov.in" &&
        url.pathname.includes("/cap_public_website/FetchXMLFile")
      );
    } catch {
      return false;
    }
  });

  if (!firstAlert) {
    throw new Error("No valid SACHET CAP link was found.");
  }

  console.log("\n=== Inspecting First CAP Alert ===");
  console.log("RSS title:", firstAlert.title);
  console.log("RSS ID:", firstAlert.id);

  const capXml = await fetchText(firstAlert.link, "CAP");

  // 4. Extract CAP fields for inspection.
  const capDetails = {
    identifier: getCapTag(capXml, "identifier"),
    sender: getCapTag(capXml, "sender"),
    sent: getCapTag(capXml, "sent"),
    status: getCapTag(capXml, "status"),
    messageType: getCapTag(capXml, "msgType"),
    event: getCapTag(capXml, "event"),
    urgency: getCapTag(capXml, "urgency"),
    severity: getCapTag(capXml, "severity"),
    certainty: getCapTag(capXml, "certainty"),
    effective: getCapTag(capXml, "effective"),
    onset: getCapTag(capXml, "onset"),
    expires: getCapTag(capXml, "expires"),
    headline: getCapTag(capXml, "headline"),
    description: getCapTag(capXml, "description"),
    instruction: getCapTag(capXml, "instruction"),
    affectedArea: getCapTag(capXml, "areaDesc"),
  };

  console.log("\n=== CAP Alert Details ===");
  console.log(JSON.stringify(capDetails, null, 2));

  console.log("\n=== Validation Summary ===");
  console.log("RSS items:", alerts.length);
  console.log("First alert has title:", Boolean(firstAlert.title));
  console.log("CAP identifier found:", Boolean(capDetails.identifier));
  console.log("CAP event found:", Boolean(capDetails.event));
  console.log("CAP severity found:", Boolean(capDetails.severity));
  console.log("CAP expiry found:", Boolean(capDetails.expires));
  console.log("\nRead-only inspection completed.");
}

main().catch((error) => {
  console.error("\nSACHET check failed:", error.message);
  process.exit(1);
});
