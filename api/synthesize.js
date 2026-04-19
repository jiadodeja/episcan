export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { items } = req.body;

  if (!items?.length) {
    return res.status(200).json({ signals: [] });
  }

  const system = `You are an epidemiological signal extractor for a public health surveillance dashboard.
Given a list of news/health report headlines and descriptions, return a JSON array of signals.
Each signal must have:
  - title: string (short headline)
  - location: string (city, country, or region — infer from text; use "Global" if unclear; ALWAYS use standard English spelling e.g. "Africa" not "Afrika", "United States" not "USA")
  - lat: number (approximate latitude; for United States use 38.0, for Global use 20.0; never use 0 as a default — always estimate a real coordinate)
  - lng: number (approximate longitude; for United States use -97.0, for Global use 0.0; never use 0 as a default for lat)
  - severity: "low" | "medium" | "high"
  - disease: string (disease or syndrome name; use "General Health Alert" if unspecified)
  - source: string (the source field from the input item)
  - confidence: number between 0.0 and 1.0 (how confident you are this is a real outbreak signal; 0.9+ for confirmed outbreaks, 0.5-0.8 for suspected, <0.5 for weak signals)
Be INCLUSIVE: extract a signal for any item related to disease, illness, infection, health alert, outbreak, epidemic, pandemic, vaccination, or public health concern — even if it seems minor or routine.
Do NOT filter items out unless they are completely unrelated to health (e.g. sports, finance, weather).
Respond with ONLY a valid JSON array, no markdown, no explanation.`;

  const userMsg = items
    .map(
      (it, i) =>
        `[${i + 1}] SOURCE:${it.source} TITLE:${it.title} DESC:${it.description?.slice(0, 200)}`
    )
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
      return res.status(500).json({ error: data.error.message });
    }

    const raw = data.content?.[0]?.text || "[]";

    // extract the JSON array — find first [ and last ]
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    const cleaned = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : "[]";

    let signals = [];
    try {
      signals = JSON.parse(cleaned);

      // normalize common location misspellings
      const locationFixes = {
        afrika: "Africa",
        "américa": "America",
        america: "America",
        eeuu: "United States",
        usa: "United States",
        "u.s.a.": "United States",
        "u.s.": "United States",
        uk: "United Kingdom",
        "u.k.": "United Kingdom",
      };
      signals = signals.map((s) => ({
        ...s,
        location: locationFixes[s.location?.toLowerCase()] || s.location,
      }));

      // jitter signals that share identical coordinates so they don't stack
      const coordCount = {};
      signals = signals.map((s) => {
        const key = `${s.lat},${s.lng}`;
        coordCount[key] = (coordCount[key] || 0) + 1;
        const n = coordCount[key] - 1;
        if (n === 0) return s;
        const angle = (n * 137.5 * Math.PI) / 180; // golden angle spread
        const radius = 0.8 + Math.floor(n / 8) * 0.8;
        return {
          ...s,
          lat: parseFloat((s.lat + radius * Math.cos(angle)).toFixed(4)),
          lng: parseFloat((s.lng + radius * Math.sin(angle)).toFixed(4)),
        };
      });
    } catch {
      signals = [];
    }

    res.status(200).json({ signals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
