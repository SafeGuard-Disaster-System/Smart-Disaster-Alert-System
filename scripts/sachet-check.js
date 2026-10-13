
const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

const CAP_HOST = "sachet.ndma.gov.in";
const CAP_PATH = "/cap_public_website/FetchXMLFile";

// Controlled sample; increase only after reviewing results.
const MAX_CAP_CHECKS = 30;
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

const OTHER_STATE_TERMS = [
  "andhra pradesh", "आंध्र प्रदेश", "bihar", "बिहार",
  "uttar pradesh", "उत्तर प्रदेश", "uttarakhand", "उत्तराखंड",
  "tamil nadu", "तमिलनाडु", "karnataka", "कर्नाटक",
  "kerala", "केरल", "telangana", "तेलंगाना",
  "gujarat", "गुजरात", "rajasthan", "राजस्थान",
  "madhya pradesh", "मध्य प्रदेश", "goa", "गोवा",
  "west bengal", "पश्चिम बंगाल", "odisha", "ओडिशा",
  "assam", "असम", "punjab", "पंजाब", "haryana", "हरियाणा",
  "himachal pradesh", "हिमाचल प्रदेश", "jharkhand", "झारखंड",
  "chhattisgarh", "छत्तीसगढ़", "manipur", "meghalaya",
  "mizoram", "nagaland", "tripura", "sikkim", "arunachal pradesh",
  "puducherry", "पुदुचेरी"
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

function classifyLocation(text) {
  const maharashtra = findTerms(text, MAHARASHTRA_TERMS);
  const otherStates = findTerms(text, OTHER_STATE_TERMS);

  if (maharashtra.length) {
    return {
      classification: "MAHARASHTRA KEYWORD — REVIEW",
      maharashtra,
      otherStates
    };
  }

  if (otherStates.length) {
    return {
      classification: "OTHER STATE KEYWORD — REVIEW",
      maharashtra,
      otherStates
    };
  }

  return {
    classification: "LOCATION UNCLEAR",
    maharashtra,
    otherStates
  };
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function classifyTime(cap) {
  const now = Date.now();
  const type = cap.msgType.toLowerCase();

  if (type === "cancel") return "CANCEL MESSAGE — REVIEW";
  if (type === "update") return "UPDATE MESSAGE — REVIEW";
  if (["ack", "error"].includes(type)) {
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
  if (expiry <= now) return "EXPIRED";

  if (!cap.effective) return "REVIEW — effective time missing";

  const effective = parseDate(cap.effective);
  if (effective === null) return "REVIEW — effective time invalid";
  if (effective > now) return "FUTURE — not active yet";

  return "UNEXPIRED — manual review required";
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
    sent: getCapTag(xml, "sent"),
    effective: getCapTag(xml, "effective"),
    onset: getCapTag(xml, "onset"),
    expires: getCapTag(xml, "expires"),
    references: getCapTag(xml, "references"),
    headline: getCapTag(xml, "headline"),
    description: getCapTag(xml, "description"),
    instruction: getCapTag(xml, "instruction"),
    areaDesc: getCapTag(xml, "areaDesc")
  };

  const searchableText = [
    item.title,
    cap.event,
    cap.headline,
    cap.description,
    cap.instruction,
    cap.areaDesc
  ].join(" ");

  const location = classifyLocation(searchableText);

  return {
    title: item.title || cap.headline || "(untitled)",
    identifier: cap.identifier || item.id || "(missing ID)",
    references: cap.references || "(none provided)",
    event: cap.event || "(missing event)",
    area: cap.areaDesc || "(missing area)",
    severity: cap.severity || "(missing severity)",
    urgency: cap.urgency || "(missing urgency)",
    certainty: cap.certainty || "(missing certainty)",
    sent: cap.sent || "(missing sent time)",
    expires: cap.expires || "(missing expiry)",
    time: classifyTime(cap),
    ...location
  };
}

async function main() {
  console.log("=== SafeGuard Expanded CAP Sample Dry Run ===");
  console.log("Mode: READ-ONLY; no Firebase writes");
  console.log(`CAP request limit: ${MAX_CAP_CHECKS}`);
  console.log(`Concurrent requests: ${CONCURRENCY}`);

  const rss = await fetchText(FEED_URL);
  const items = parseRssItems(rss);

  console.log(`RSS items found: ${items.length}`);

  const validItems = items.filter(
    item => item.link && validCapUrl(item.link)
  );

  const candidates = validItems.slice(0, MAX_CAP_CHECKS);

  console.log(`Valid CAP links: ${validItems.length}`);
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
        console.log(`References: ${result.references}`);
        console.log(`Event: ${result.event}`);
        console.log(`Area: ${result.area}`);
        console.log(`Severity: ${result.severity}`);
        console.log(`Urgency: ${result.urgency}`);
        console.log(`Certainty: ${result.certainty}`);
        console.log(`Sent: ${result.sent}`);
        console.log(`Expires: ${result.expires}`);
        console.log(`Time: ${result.time}`);
        console.log(`Location: ${result.classification}`);

        if (result.maharashtra.length) {
          console.log(`Maharashtra keywords: ${result.maharashtra.join(", ")}`);
        }

        if (result.otherStates.length) {
          console.log(`Other-state keywords: ${result.otherStates.join(", ")}`);
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
    result => result.classification === "MAHARASHTRA KEYWORD — REVIEW"
  );
  const elsewhere = results.filter(
    result => result.classification === "OTHER STATE KEYWORD — REVIEW"
  );
  const unclear = results.filter(
    result => result.classification === "LOCATION UNCLEAR"
  );
  const expired = results.filter(result => result.time === "EXPIRED");
  const updates = results.filter(result => result.time === "UPDATE MESSAGE — REVIEW");
  const cancellations = results.filter(
    result => result.time === "CANCEL MESSAGE — REVIEW"
  );

  console.log("\n=== SUMMARY ===");
  console.log(`RSS items scanned: ${items.length}`);
  console.log(`Valid CAP links: ${validItems.length}`);
  console.log(`CAP records checked: ${results.length}`);
  console.log(`Fetch errors: ${errors.length}`);
  console.log(`Maharashtra keyword matches: ${maharashtra.length}`);
  console.log(`Other-state keyword matches: ${elsewhere.length}`);
  console.log(`Location unclear: ${unclear.length}`);
  console.log(`Expired records: ${expired.length}`);
  console.log(`Update messages: ${updates.length}`);
  console.log(`Cancellation messages: ${cancellations.length}`);
  console.log("Firebase writes: 0");
  console.log("Automatic alerts published: 0");
  console.log("Dry run complete.");
}

main().catch(error => {
  console.error("DRY RUN FAILED:", error.message);
  process.exitCode = 1;
});
