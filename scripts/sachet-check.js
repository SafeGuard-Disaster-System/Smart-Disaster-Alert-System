
const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";

// Inspect a small sample first; this is not a complete feed scan.
const MAX_CAP_CHECKS = 10;
const CONCURRENCY = 2;

const MAHARASHTRA_TERMS = [
  "maharashtra", "महाराष्ट्र", "mumbai", "मुंबई", "navi mumbai",
  "नवी मुंबई", "thane", "ठाणे", "palghar", "पालघर", "raigad",
  "रायगड", "ratnagiri", "रत्नागिरी", "sindhudurg", "सिंधुदुर्ग",
  "pune", "पुणे", "nashik", "नाशिक", "nagpur", "नागपूर",
  "kolhapur", "कोल्हापूर", "satara", "सातारा", "sangli", "सांगली",
  "solapur", "सोलापूर", "ahilyanagar", "ahmednagar", "अहिल्यानगर",
  "dhule", "धुळे", "nandurbar", "नंदुरबार", "jalgaon", "जळगाव",
  "chhatrapati sambhajinagar", "aurangabad", "छत्रपती संभाजीनगर",
  "jalna", "जालना", "beed", "बीड", "latur", "लातूर",
  "dharashiv", "osmanabad", "nanded", "नांदेड", "parbhani", "परभणी",
  "hingoli", "हिंगोली", "akola", "अकोला", "amravati", "अमरावती",
  "buldhana", "बुलढाणा", "washim", "वाशिम", "yavatmal", "यवतमाळ",
  "wardha", "वर्धा", "bhandara", "भंडारा", "gondia", "गोंदिया",
  "chandrapur", "चंद्रपूर", "gadchiroli", "गडचिरोली",
  "baramati", "kalyan", "कल्याण", "dombivli", "डोंबिवली",
  "ulhasnagar", "badlapur", "panvel", "पनवेल", "vasai", "virar"
];

// These state names help confirm a location only when explicitly present.
// This list is not an exhaustive geographic database.
const OTHER_STATE_TERMS = [
  "andhra pradesh", "आंध्र प्रदेश", "bihar", "बिहार",
  "uttar pradesh", "उत्तर प्रदेश", "uttarakhand", "उत्तराखंड",
  "tamil nadu", "तमिलनाडु", "karnataka", "कर्नाटक",
  "kerala", "केरल", "telangana", "तेलंगाना",
  "gujarat", "गुजरात", "rajasthan", "राजस्थान",
  "madhya pradesh", "मध्य प्रदेश", "goa", "गोवा",
  "west bengal", "पश्चिम बंगाल", "odisha", "ओडिशा",
  "assam", "असम", "punjab", "पंजाब", "haryana", "हरियाणा",
  "himachal pradesh", "हिमाचल प्रदेश",
  "jharkhand", "झारखंड", "chhattisgarh", "छत्तीसगढ़",
  "manipur", "meghalaya", "mizoram", "nagaland", "tripura",
  "sikkim", "arunachal pradesh"
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

function findTerms(text, terms) {
  const normalized = text.toLowerCase();

  return terms.filter(term => {
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${safe}([^a-z]|$)`, "i")
      .test(normalized);
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

  if (type !== "alert") {
    return `REVIEW — message type ${cap.msgType || "missing"}`;
  }

  if (!cap.expires) return "REVIEW — expiry missing";

  const expiry = parseDate(cap.expires);
  if (expiry === null) return "REVIEW — expiry invalid";
  if (expiry <= now) return "EXPIRED";

  if (!cap.effective) return "REVIEW — effective time missing";

  const effective = parseDate(cap.effective);
  if (effective === null) return "REVIEW — effective time invalid";
  if (effective > now) return "FUTURE — not active yet";

  return "UNEXPIRED — manual review required";
}

function classifyLocation(text) {
  const maharashtraMatches = findTerms(text, MAHARASHTRA_TERMS);
  const otherStateMatches = findTerms(text, OTHER_STATE_TERMS);

  if (maharashtraMatches.length > 0) {
    return {
      classification: "MAHARASHTRA MATCH — REVIEW",
      maharashtraMatches,
      otherStateMatches
    };
  }

  if (otherStateMatches.length > 0) {
    return {
      classification: "OTHER STATE MENTION — REVIEW",
      maharashtraMatches,
      otherStateMatches
    };
  }

  return {
    classification: "LOCATION UNCLEAR",
    maharashtraMatches,
    otherStateMatches
  };
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
    expires: getCapTag(xml, "expires"),
    headline: getCapTag(xml, "headline"),
    description: getCapTag(xml, "description"),
    areaDesc: getCapTag(xml, "areaDesc")
  };

  const locationText = [
    item.title, cap.event, cap.headline,
    cap.description, cap.areaDesc
  ].join(" ");

  const location = classifyLocation(locationText);

  return {
    title: item.title || cap.headline || "(untitled)",
    identifier: cap.identifier || item.id || "(missing ID)",
    event: cap.event || "(missing event)",
    area: cap.areaDesc || "(missing area)",
    severity: cap.severity || "(missing severity)",
    urgency: cap.urgency || "(missing urgency)",
    certainty: cap.certainty || "(missing certainty)",
    time: classifyTime(cap),
    ...location
  };
}

async function main() {
  console.log("=== SafeGuard Location Classification Dry Run ===");
  console.log("Mode: READ-ONLY; no Firebase writes");

  const rss = await fetchText(FEED_URL);
  const items = parseRssItems(rss);

  console.log(`RSS items found: ${items.length}`);

  const candidates = items
    .filter(item => item.link && validCapUrl(item.link))
    .slice(0, MAX_CAP_CHECKS);

  console.log(`CAP records selected: ${candidates.length}`);
  console.log("This is a limited sample, not a complete scan.");

  const results = [];
  const errors = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < candidates.length) {
      const item = candidates[nextIndex++];

      try {
        const result = await checkCap(item);
        results.push(result);

        console.log("\n--- CAP RECORD ---");
        console.log(`Title: ${result.title}`);
        console.log(`ID: ${result.identifier}`);
        console.log(`Event: ${result.event}`);
        console.log(`Area: ${result.area}`);
        console.log(`Severity: ${result.severity}`);
        console.log(`Urgency: ${result.urgency}`);
        console.log(`Certainty: ${result.certainty}`);
        console.log(`Time: ${result.time}`);
        console.log(`Location: ${result.classification}`);

        if (result.maharashtraMatches.length) {
          console.log(`Maharashtra terms: ${result.maharashtraMatches.join(", ")}`);
        }

        if (result.otherStateMatches.length) {
          console.log(`Other state terms: ${result.otherStateMatches.join(", ")}`);
        }
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

  const maharashtra = results.filter(
    result => result.classification === "MAHARASHTRA MATCH — REVIEW"
  );

  const elsewhere = results.filter(
    result => result.classification === "OTHER STATE MENTION — REVIEW"
  );

  const unclear = results.filter(
    result => result.classification === "LOCATION UNCLEAR"
  );

  const expired = results.filter(result => result.time === "EXPIRED");

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`CAP records checked: ${results.length}`);
  console.log(`Fetch errors: ${errors.length}`);
  console.log(`Maharashtra keyword matches: ${maharashtra.length}`);
  console.log(`Other state mentions: ${elsewhere.length}`);
  console.log(`Location unclear: ${unclear.length}`);
  console.log(`Expired records: ${expired.length}`);
  console.log("Firebase writes: 0");
  console.log("Automatic alerts published: 0");
  console.log("Dry run complete.");
}

main().catch(error => {
  console.error("DRY RUN FAILED:", error.message);
  process.exitCode = 1;
});
