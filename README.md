# EpiScan

A real-time disease outbreak surveillance dashboard. Three AI agents automatically monitor public health feeds and news sources, cross-reference signals, and plot active outbreaks on a live world map ranked by severity.

## What it does

When you open EpiScan, a pipeline fires automatically. One agent scans Google News for early warning headlines, another reads CDC and CIDRAP official health reports, and a third uses Claude to cross-reference both and decide what's actually worth flagging. The results show up as color-coded markers on a world map (red for high severity, amber for moderate, green for low).

Each marker shows the disease name, location, confidence level, and source when you hover over it.

## How it works

**Frontend (React + Vite)**
- Interactive world map using react-leaflet
- Color-coded severity markers with hover tooltips
- Pipeline runs automatically on load, with a manual re-run button
- Golden-angle coordinate jitter to spread overlapping signals

**Backend (Node/Express on Vercel)**
- Three agents pulling from free public RSS feeds: Google News, CDC, and CIDRAP
- Claude (Anthropic API) acts as the synthesizer — it receives all raw items and returns structured JSON signals with disease name, location, coordinates, severity, confidence, and source
- API key stored server-side, never exposed to the browser
- Deployed as Vercel serverless functions

**Agent pipeline**
```
Load → News Agent (Google News RSS)
     → Health Agent (CDC + CIDRAP RSS)
     → Synthesizer Agent (Claude) → structured signals → map markers
```

## Stack

- React + Vite
- react-leaflet
- Node.js / Express
- Anthropic API (Claude)
- Vercel (serverless deployment)

## Running it locally

```bash
npm install
npm run dev
```

You'll need an Anthropic API key in a `.env` file:
```
ANTHROPIC_API_KEY=your_key_here
```


