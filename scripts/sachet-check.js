const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const MAX_ALERTS_TO_CHECK = 5;

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

function getTag(xml, tag) {
  const name = escapeRegex(tag);
  const match = xml.match(
    new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`,
      "i"
    )
  );

  return match ? decodeXml(match[1]) : "";
}

function getCapTag(xml, tag) {
  const name = escapeRegex(tag);
  const match = xml.match(
    new RegExp(
      `<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`,
      "i"
    )
  );

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

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validateCap(cap, now) {
  const sent = parseDate(cap.sent);
  const effective = parseDate(cap.effective);
  const onset = parseDate(cap.onset);
  const expires = parseDate(cap.expires);

  const status = cap.status.toLowerCase();
  const messageType = cap.messageType.toLowerCase();

  let classification = "REVIEW";

  if (status === "test" || status === "exercise" || status === "system") {
    classification = "NON-PUBLIC TEST MESSAGE";
  } else if (status !== "actual") {
    classification = "REVIEW: UNKNOWN STATUS";
  } else if (
    ["cancel", "ack", "error"].includes(messageType)
  ) {
    classification = `SPECIAL MESSAGE: ${cap.messageType}`;
  } else if (messageType !== "alert" && messageType !== "update") {
    classification = "REVIEW: UNKNOWN MESSAGE TYPE";
  } else if (!cap.identifier || !cap.event || !cap.affectedArea) {
    classification = "REVIEW: REQUIRED FIELD MISSING";
  } else if (!expires) {
    classification = "REVIEW: INVALID OR MISSING EXPIRY";
  } else if (expires <= now) {
    classification = "EXPIRED";
  } else if (effective && effective > now) {
    classification = "FUTURE EFFECTIVE TIME";
  } else if (onset && onset > now) {
    classification = "UPCOMING";
  } else {
    classification = "UNEXPIRED — REVIEW FOR PUBLISHING";
  }

  return {
    classification,
    sentValid: Boolean(sent),
    effectiveValid: Boolean(effective),
    onsetValid: Boolean(onset),
    expiresValid: Boolean(expires),
    expiryPassed: expires !== null && expires <= now,
  };
}

async function main() {
  console.log("=== SafeGuard Multi-Alert Dry Run ===");

  const rssXml = await fetchText(FEED_URL, "RSS");
  const items =
    rssXml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

  console.log("Total RSS items:", items.length);

  if (!items.length) {
    throw new Error("No RSS items found.");
  }

  const alerts = items.map((item) => ({
    title: getTag(item, "title"),
    publishedAt: getTag(item, "pubDate"),
    id: getTag(item, "guid"),
    link: getTag(item, "link"),
  }));

  const missingTitles = alerts.filter((a) => !a.title).length;
  const missingIds = alerts.filter((a) => !a.id).length;
  const missingLinks = alerts.filter((a) => !a.link).length;

  console.log("Missing titles:", missingTitles);
  console.log("Missing IDs:", missingIds);
  console.log("Missing links:", missingLinks);

  const candidates = alerts
    .filter((alert) => {
      if (!alert.link || !alert.id || !alert.title) return false;

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
    })
    .slice(0, MAX_ALERTS_TO_CHECK);

  if (!candidates.length) {
    throw new Error("No valid SACHET CAP links found.");
  }

  const now = Date.now();
  const results = [];

  for (const alert of candidates) {
    console.log("\n----------------------------------------");
    console.log("RSS ID:", alert.id);
    console.log("Title:", alert.title);

    try {
      const capXml = await fetchText(alert.link, `CAP ${alert.id}`);

      const cap = {
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

      const validation = validateCap(cap, now);

      const result = {
        rssId: alert.id,
        capIdentifier: cap.identifier,
        sender: cap.sender,
        event: cap.event,
        severity: cap.severity,
        urgency: cap.urgency,
        certainty: cap.certainty,
        status: cap.status,
        messageType: cap.messageType,
        effective: cap.effective,
        onset: cap.onset,
        expires: cap.expires,
        affectedArea: cap.affectedArea,
        classification: validation.classification,
        validation,
      };

      results.push(result);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const result = {
        rssId: alert.id,
        title: alert.title,
        classification: "FETCH OR PARSE ERROR",
        error: error.message,
      };

      results.push(result);
      console.error(JSON.stringify(result, null, 2));
    }
  }

  console.log("\n=== DRY-RUN SUMMARY ===");
  console.log("Checked:", results.length);
  console.log(
    "Expired:",
    results.filter((r) => r.classification === "EXPIRED").length
  );
  console.log(
    "Unexpired — review for publishing:",
    results.filter((r) =>
      r.classification === "UNEXPIRED — REVIEW FOR PUBLISHING"
    ).length
  );
  console.log(
    "Upcoming:",
    results.filter((r) => r.classification === "UPCOMING").length
  );
  console.log(
    "Special messages:",
    results.filter((r) =>
      r.classification.startsWith("SPECIAL MESSAGE")
    ).length
  );
  console.log(
    "Errors:",
    results.filter((r) =>
      r.classification === "FETCH OR PARSE ERROR"
    ).length
  );

  console.log("\nDRY RUN ONLY: Firebase was not changed.");
  console.log("No alerts were published or notifications sent.");
}

main().catch((error) => {
  console.error("SACHET dry run failed:", error.message);
  process.exit(1);
});
