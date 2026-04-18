import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Claude chat ──────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, system } = req.body;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: system || "",
      messages,
    }),
  });
  const data = await response.json();
  res.json(data);
});

// ── RSS proxy helper ─────────────────────────────────────────────────────────────
async function fetchRSS(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "EpiScan/1.0 (health surveillance research)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
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
    if (title) items.push({ title, link, pubDate, description: desc });
  }
  return items;
}

// ── CDC RSS endpoint ──────────────────────────────────────────────────────────────
app.get("/api/feeds/cdc", async (req, res) => {
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
    res.json({ source: "cdc", count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Google News RSS endpoint ──────────────────────────────────────────────────────────
app.get("/api/feeds/news", async (req, res) => {
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
    res.json({ source: "news", count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Synthesizer: ask Claude to extract location + severity from items ───────
app.post("/api/synthesize", async (req, res) => {
  const { items } = req.body; // array of { title, description, source }
  if (!items?.length) return res.json({ signals: [] });

  const system = `You are an epidemiological signal extractor.
Given a list of news/health report headlines and descriptions, return a JSON array of signals.
Each signal must have:
  - title: string (short headline)
  - location: string (city, country, or region — infer from text; use "Unknown" if unclear)
  - lat: number (approximate latitude of location)
  - lng: number (approximate longitude of location)
  - severity: "low" | "medium" | "high"
  - disease: string (disease or syndrome name, or "Unknown")
  - source: string ("cdc" or "news")
Only include items that describe a real or potential disease outbreak or public health threat.
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
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const data = await response.json();
    const raw = data.content?.[0]?.text || "[]";
    let signals = [];
    try { signals = JSON.parse(raw); } catch { signals = []; }
    res.json({ signals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("EpiScan server running on http://localhost:3001");
});

