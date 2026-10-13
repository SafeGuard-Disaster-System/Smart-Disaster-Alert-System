const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const MAX_ALERTS_TO_CHECK = 5;

// Explicitly named Maharashtra districts and locations.
// This is a basic text filter, not a geographic boundary check.
const MAHARASHTRA_LOCATIONS = [
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
  "panvel",
  "ulhasnagar",
  "badlapur",
  "vasai",
  "virar",
];

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

function classifyLocation(area, headline, description) {
  const text = `${area} ${headline} ${description}`
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const matches = MAHARASHTRA_LOCATIONS.filter((place) => {
    const escaped = escapeRegex(place);
    return new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").test(text);
  });

  if (matches.length > 0) {
    return {
      locationClassification: "MAHARASHTRA MENTION — REVIEW",
      matchedLocations: matches,
    };
  }

  // No match does not prove the alert is outside Maharashtra.
  return {
    locationClassification: "LOCATION UNCLEAR / NO MAHARASHTRA MATCH",
    matchedLocations: [],
  };
}

function validateCap(cap, now) {
  const effective = parseDate(cap.effective);
  const onset = parseDate(cap.onset);
  const expires = parseDate(cap.expires);

  const status = cap.status.toLowerCase();
  const messageType = cap.messageType.toLowerCase();

  let timeClassification = "REVIEW";

  if (status !== "actual") {
    timeClassification = "NON-ACTUAL STATUS — REVIEW";
  } else if (["cancel", "ack", "error"].includes(messageType)) {
    timeClassification = `SPECIAL MESSAGE: ${cap.messageType}`;
  } else if (!["alert", "update"].includes(messageType)) {
    timeClassification = "UNKNOWN MESSAGE TYPE — REVIEW";
  } else if (!cap.identifier || !cap.event || !cap.affectedArea) {
    timeClassification = "REQUIRED FIELD MISSING — REVIEW";
  } else if (!expires) {
    timeClassification = "MISSING / INVALID EXPIRY — REVIEW";
  } else if (expires <= now) {
    timeClassification = "EXPIRED";
  } else if (effective && effective > now) {
    timeClassification = "FUTURE EFFECTIVE TIME";
  } else if (onset && onset > now) {
    timeClassification = "UPCOMING";
  } else {
    timeClassification = "UNEXPIRED — REVIEW FOR PUBLISHING";
  }

  return {
    timeClassification,
    effectiveValid: Boolean(effective),
    onsetValid: Boolean(onset),
    expiresValid: Boolean(expires),
    expiryPassed: expires !== null && expires <= now,
  };
}

async function main() {
  console.log("=== SafeGuard Maharashtra Filter Dry Run ===");

  const rssXml = await fetchText(FEED_URL, "RSS");
  const items =
    rssXml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

  console.log("Total RSS items:", items.length);

  if (items.length === 0) {
    throw new Error("No RSS items found.");
  }

  const alerts = items.map((item) => ({
    title: getTag(item, "title"),
    publishedAt: getTag(item, "pubDate"),
    id: getTag(item, "guid"),
    link: getTag(item, "link"),
  }));

  console.log(
    "Missing titles:",
    alerts.filter((a) => !a.title).length
  );
  console.log(
    "Missing IDs:",
    alerts.filter((a) => !a.id).length
  );
  console.log(
    "Missing links:",
    alerts.filter((a) => !a.link).length
  );

  const candidates = alerts
    .filter((alert) => {
      if (!alert.title || !alert.id || !alert.link) return false;

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

      const timing = validateCap(cap, now);
      const location = classifyLocation(
        cap.affectedArea,
        cap.headline,
        cap.description
      );

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
        ...timing,
        ...location,
      };

      results.push(result);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const result = {
        rssId: alert.id,
        classification: "FETCH OR PARSE ERROR",
        error: error.message,
      };

      results.push(result);
      console.error(JSON.stringify(result, null, 2));
    }
  }

  console.log("\n=== DRY-RUN SUMMARY ===");
  console.log("CAP records checked:", results.length);
  console.log(
    "Maharashtra mentions — review:",
    results.filter((r) =>
      r.locationClassification === "MAHARASHTRA MENTION — REVIEW"
    ).length
  );
  console.log(
    "No Maharashtra match / unclear:",
    results.filter((r) =>
      r.locationClassification === "LOCATION UNCLEAR / NO MAHARASHTRA MATCH"
    ).length
  );
  console.log(
    "Expired:",
    results.filter((r) => r.timeClassification === "EXPIRED").length
  );
  console.log(
    "Fetch/parse errors:",
    results.filter((r) => r.classification === "FETCH OR PARSE ERROR").length
  );

  console.log("\nDRY RUN ONLY: Firebase was not changed.");
  console.log("No alerts were published or notifications sent.");
  console.log(
    "Location matching is text-based; it does not confirm geographic impact."
  );
}

main().catch((error) => {
  console.error("Dry run failed:", error.message);
  process.exit(1);
});
