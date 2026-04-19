// ── shared helpers ────────────────────────────────────────────────────────────
async function fetchRSS(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "EpiScan/1.0 (health surveillance research)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))));
}

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
      );
      const match = r.exec(block);
      return match ? (match[1] || match[2] || "").trim() : "";
    };
    const title = get("title");
    const link = get("link") || get("guid");
    const pubDate = get("pubDate");
    const desc = get("description");
    if (title)
      items.push({
        title: decodeHtmlEntities(title),
        link: decodeHtmlEntities(link),
        pubDate,
        description: decodeHtmlEntities(desc),
      });
  }
  return items;
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const urls = [
      "https://www.cidrap.umn.edu/news/49/rss",     // Avian Influenza
      "https://www.cidrap.umn.edu/news/78/rss",     // Measles
      "https://www.cidrap.umn.edu/news/230556/rss", // Mpox
      "https://www.cidrap.umn.edu/news/64/rss",     // Ebola
      "https://www.cidrap.umn.edu/news/91/rss",     // Public Health
    ];

    const results = await Promise.allSettled(urls.map(fetchRSS));
    const seen = new Set();
    const items = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => parseRSSItems(r.value))
      .filter((item) => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      })
      .slice(0, 20);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({ source: "promed", count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
