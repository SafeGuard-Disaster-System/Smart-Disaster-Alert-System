const FEED_URL =
  "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";

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
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}\\s*>`,
      "i"
    )
  );

  return match ? decodeXml(match[1]) : "";
}

async function main() {
  const response = await fetch(FEED_URL);

  console.log("HTTP status:", response.status);

  if (!response.ok) {
    throw new Error(`SACHET feed returned HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

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

  const missingTitles = alerts.filter((alert) => !alert.title).length;
  const missingIds = alerts.filter((alert) => !alert.id).length;

  console.log("Missing titles:", missingTitles);
  console.log("Missing IDs:", missingIds);
  console.log("Sample alerts:");

  console.log(JSON.stringify(alerts.slice(0, 3), null, 2));
}

main().catch((error) => {
  console.error("SACHET check failed:", error);
  process.exit(1);
});
