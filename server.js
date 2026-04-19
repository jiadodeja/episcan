import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ts = () => new Date().toISOString().slice(11, 23);
const log = (emoji, msg) => console.log(`[${ts()}] ${emoji}  ${msg}`);

// ── Claude chat ──────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, system } = req.body;
  log("💬", `Chat request — ${messages?.length ?? 0} message(s)`);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: system || "",
      messages,
    }),
  });
  const data = await response.json();
  log("✅", `Chat response — stop_reason: ${data.stop_reason ?? "unknown"}`);
  res.json(data);
});

// ── RSS proxy helper ─────────────────────────────────────────────────────────────
async function fetchRSS(url) {
  log("🌐", `Fetching RSS: ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": "EpiScan/1.0 (health surveillance research)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  log("📥", `RSS OK: ${url}`);
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
    .replace(/&#\d+;/g, m => String.fromCharCode(parseInt(m.slice(2, -1))));
}

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`);
      const match = r.exec(block);
      return match ? (match[1] || match[2] || "").trim() : "";
    };
    const title   = get("title");
    const link    = get("link") || get("guid");
    const pubDate = get("pubDate");
    const desc    = get("description");
    if (title) items.push({
      title:       decodeHtmlEntities(title),
      link:        decodeHtmlEntities(link),
      pubDate,
      description: decodeHtmlEntities(desc),
    });
  }
  return items;
}

// ── CDC RSS endpoint ──────────────────────────────────────────────────────────────
app.get("/api/feeds/cdc", async (req, res) => {
  log("📡", "CDC feed request received");
  try {
    // CDC Morbidity and Mortality Weekly Report + outbreak notices
    const urls = [
      "https://tools.cdc.gov/api/v2/resources/media/132608.rss", // MMWR
      "https://emergency.cdc.gov/han/han.rss",                   // Health Alert Network
    ];
    const results = await Promise.allSettled(urls.map(fetchRSS));
    const items = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => parseRSSItems(r.value))
      .slice(0, 20);
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed) log("⚠️", `CDC: ${failed} feed(s) failed`);
    log("✅", `CDC feed done — ${items.length} items returned`);
    res.json({ source: "cdc", count: items.length, items });
  } catch (err) {
    log("❌", `CDC feed error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Google News RSS endpoint ──────────────────────────────────────────────────────────
app.get("/api/feeds/news", async (req, res) => {
  log("📡", "News feed request received");
  try {
    const queries = [
      "disease outbreak",
      "epidemic health alert",
      "infectious disease spread",
    ];
    const urls = queries.map(
      q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
    );
    const results = await Promise.allSettled(urls.map(fetchRSS));
    const seen = new Set();
    const items = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => parseRSSItems(r.value))
      .filter(item => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      })
      .slice(0, 20);
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed) log("⚠️", `News: ${failed} feed(s) failed`);
    log("✅", `News feed done — ${items.length} items returned`);
    res.json({ source: "news", count: items.length, items });
  } catch (err) {
    log("❌", `News feed error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── CIDRAP endpoint ───────────────────────────────────
app.get("/api/feeds/promed", async (req, res) => {
  log("📡", "CIDRAP feed request received");
  try {
    const urls = [
      "https://www.cidrap.umn.edu/news/49/rss",    // Avian Influenza
      "https://www.cidrap.umn.edu/news/78/rss",    // Measles
      "https://www.cidrap.umn.edu/news/230556/rss", // Mpox
      "https://www.cidrap.umn.edu/news/64/rss",    // Ebola
      "https://www.cidrap.umn.edu/news/91/rss",    // Public Health
    ];
    const results = await Promise.allSettled(urls.map(fetchRSS));
    results.forEach((r, i) => {
      if (r.status === "rejected") log("❌", `CIDRAP feed[${i}] error: ${r.reason?.message}`);
    });
    const seen = new Set();
    const items = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => parseRSSItems(r.value))
      .filter(item => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      })
      .slice(0, 20);
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed) log("⚠️", `CIDRAP: ${failed} feed(s) failed`);
    log("✅", `CIDRAP feed done — ${items.length} items returned`);
    res.json({ source: "promed", count: items.length, items });
  } catch (err) {
    log("❌", `CIDRAP feed error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/synthesize", async (req, res) => {
  const { items } = req.body; // array of { title, description, source }
  log("🧠", `Synthesize request — ${items?.length ?? 0} items received`);
  log("📋", `Sample item: ${JSON.stringify(items[0]).slice(0, 200)}`);
  log("📝", `All titles:\n${items.map((it, i) => `  [${i+1}] [${it.source}] ${it.title}`).join("\n")}`);
  if (!items?.length) {
    log("⚠️", "Synthesize: no items, returning empty");
    return res.json({ signals: [] });
  }

  const system = `You are an epidemiological signal extractor for a public health surveillance dashboard.
Given a list of news/health report headlines and descriptions, return a JSON array of signals.
Each signal must have:
  - title: string (short headline)
  - location: string (city, country, or region — infer from text; use "Global" if unclear; ALWAYS use standard English spelling e.g. "Africa" not "Afrika", "United States" not "USA")
  - lat: number (approximate latitude of location; use 0 if truly unknown)
  - lng: number (approximate longitude of location; use 0 if truly unknown)
  - severity: "low" | "medium" | "high"
  - disease: string (disease or syndrome name; use "General Health Alert" if unspecified)
  - source: string (the source field from the input item)
  - confidence: number between 0.0 and 1.0 (how confident you are this is a real outbreak signal; 0.9+ for confirmed outbreaks, 0.5-0.8 for suspected, <0.5 for weak signals)
Be INCLUSIVE: extract a signal for any item related to disease, illness, infection, health alert, outbreak, epidemic, pandemic, vaccination, or public health concern — even if it seems minor or routine.
Do NOT filter items out unless they are completely unrelated to health (e.g. sports, finance, weather).
Respond with ONLY a valid JSON array, no markdown, no explanation.`;

  const userMsg = items
    .map((it, i) => `[${i + 1}] SOURCE:${it.source} TITLE:${it.title} DESC:${it.description?.slice(0, 200)}`)
    .join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.VITE_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8096,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const data = await response.json();
    if (data.error) {
      log("❌", `Anthropic API error: ${data.error.type} — ${data.error.message}`);
      return res.status(500).json({ error: data.error.message });
    }
    const raw = data.content?.[0]?.text || "[]";
    log("📄", `Claude raw response (${raw.length} chars): ${raw.slice(0, 300)}`);
    let signals = [];
    // extract the JSON array directly — find first [ and last ]
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    const cleaned = (start !== -1 && end !== -1) ? raw.slice(start, end + 1) : "[]";
    try {
      signals = JSON.parse(cleaned);
      // normalize common location misspellings
      const locationFixes = {
        "afrika": "Africa",
        "américa": "America",
        "america": "America",
        "eeuu": "United States",
        "usa": "United States",
        "u.s.a.": "United States",
        "u.s.": "United States",
        "uk": "United Kingdom",
        "u.k.": "United Kingdom",
      };
      signals = signals.map(s => ({
        ...s,
        location: locationFixes[s.location?.toLowerCase()] || s.location,
      }));
      log("✅", `Synthesize done — ${signals.length} signal(s) extracted`);
      signals.forEach(s => log("📍", `${s.source} | ${s.disease} | ${s.location} | lat:${s.lat} lng:${s.lng}`));
    } catch {
      log("⚠️", "Synthesize: failed to parse Claude response as JSON");
      signals = [];
    }
    res.json({ signals });
  } catch (err) {
    log("❌", `Synthesize error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("EpiScan server running on http://localhost:3001");
});

