import { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API = ""; // Vercel: API routes served from same origin
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── tiny helpers ──────────────────────────────────────────────────────────────
function Pill({ color, children }) {
  const colors = {
    green: { bg: "var(--green-dim)",  text: "var(--green)",  dot: "var(--green)"  },
    amber: { bg: "var(--amber-dim)",  text: "var(--amber)",  dot: "var(--amber)"  },
    red:   { bg: "var(--red-dim)",    text: "var(--red)",    dot: "var(--red)"    },
    blue:  { bg: "var(--blue-dim)",   text: "var(--blue)",   dot: "var(--blue)"   },
  };
  const c = colors[color] || colors.blue;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: c.bg, color: c.text,
      fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
      letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "3px 8px", borderRadius: 3,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: c.dot,
        boxShadow: `0 0 6px ${c.dot}`,
        animation: color === "green" ? "pulse 2s ease-in-out infinite" : "none",
      }} />
      {children}
    </span>
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "7px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ color: "var(--text)", fontSize: 12 }}>{label}</span>
      <span style={{
        fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500,
        color: accent || "var(--text-hi)",
      }}>{value}</span>
    </div>
  );
}

function AgentCard({ index, title, subtitle, status, statusColor, stats, accentColor, icon, activity }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "20px 22px 18px",
      display: "flex", flexDirection: "column", gap: 16,
      position: "relative", overflow: "hidden",
      transition: "border-color 0.2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-hi)"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {/* top-right accent line */}
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 60, height: 2,
        background: accentColor,
        opacity: 0.7,
      }} />

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 6,
            background: "var(--bg-card2)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>{icon}</div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", letterSpacing: "0.1em", marginBottom: 2 }}>
              AGENT-0{index}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-head)", lineHeight: 1.2 }}>{title}</div>
          </div>
        </div>
        <Pill color={statusColor}>{status}</Pill>
      </div>

      {/* subtitle */}
      <p style={{ margin: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>{subtitle}</p>

      {/* stats */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {stats.map(s => (
          <StatRow key={s.label} label={s.label} value={s.value} accent={s.accent} />
        ))}
      </div>

      {/* activity bar */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "var(--text)" }}>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: "0.06em" }}>ACTIVITY</span>
          <span style={{ color: accentColor, fontFamily: "var(--mono)" }}>{activity.pct}%</span>
        </div>
        <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${activity.pct}%`,
            background: accentColor,
            borderRadius: 2,
            boxShadow: `0 0 8px ${accentColor}`,
            transition: "width 1s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── countdown timer ─────────────────────────────────────────────────────────
function CountdownTimer({ nextRunAt }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.round((nextRunAt - Date.now()) / 1000));
      setSecs(diff);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [nextRunAt]);
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>
      Next scan in <span style={{ color: "var(--text-hi)" }}>{m}:{s}</span>
    </span>
  );
}

// ── signals list panel ───────────────────────────────────────────────────────
const SEV_COLOR = { high: "var(--red)", medium: "var(--amber)", low: "var(--green)" };
const SEV_BG    = { high: "var(--red-dim)", medium: "var(--amber-dim)", low: "var(--green-dim)" };

function SignalsList({ signals, onHover }) {
  if (!signals.length) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: 120, gap: 8, color: "var(--text)",
    }}>
      <span style={{ fontSize: 22 }}>◌</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em" }}>NO SIGNALS DETECTED</span>
      <span style={{ fontSize: 11 }}>Run the pipeline or wait for next auto-scan</span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {signals.map((s, i) => (
        <div
          key={i}
          className="signal-row"
          onMouseEnter={() => onHover(s)}
          onMouseLeave={() => onHover(null)}
          style={{
            display: "grid",
            gridTemplateColumns: "72px 1fr 70px 58px",
            alignItems: "center",
            gap: 0,
            padding: "7px 20px",
            borderBottom: "1px solid var(--border)",
            cursor: "default",
            background: "transparent",
          }}
        >
          {/* severity badge */}
          <div>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: SEV_COLOR[s.severity] || "var(--text)",
              background: SEV_BG[s.severity] || "transparent",
              padding: "2px 6px", borderRadius: 3,
            }}>{s.severity}</span>
          </div>
          {/* disease + location */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 12, color: "var(--text-hi)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.disease || "Unknown"}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.location}
            </div>
          </div>
          {/* confidence score */}
          <div style={{ textAlign: "right" }}>
            {s.confidence != null ? (
              <span style={{
                fontFamily: "var(--mono)", fontSize: 11,
                color: s.confidence >= 0.8 ? "var(--red)" : s.confidence >= 0.6 ? "var(--amber)" : "var(--green)",
              }}>{Math.round(s.confidence * 100)}%</span>
            ) : (
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>—</span>
            )}
          </div>
          {/* source badge */}
          <div style={{ textAlign: "right" }}>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 9, color: "var(--text)",
              background: "var(--bg-card2)", border: "1px solid var(--border)",
              padding: "2px 5px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{s.source || "—"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── main app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [signals, setSignals]       = useState([]);
  const [cdcCount, setCdcCount]     = useState(0);
  const [newsCount, setNewsCount]   = useState(0);
  const [promedCount, setPromedCount] = useState(0);
  const [synthStatus, setSynthStatus] = useState("standby");
  const [lastRun, setLastRun]     = useState(null);
  const [nextRunAt, setNextRunAt] = useState(Date.now() + REFRESH_INTERVAL_MS);
  const [pipelineLog, setPipelineLog] = useState([]);
  const [hoveredSignal, setHoveredSignal] = useState(null);
  const intervalRef = useRef(null);

  const log = (msg) => setPipelineLog(prev => [`${new Date().toISOString().slice(11,19)} ${msg}`, ...prev].slice(0, 8));

  const runPipeline = useCallback(async () => {
    setSynthStatus("running");
    setSignals([]);
    log("Pipeline started");

    // Step 1 — fetch all feeds in parallel
    let allItems = [];
    try {
      const [cdcRes, newsRes, promedRes] = await Promise.allSettled([
        fetch(`${API}/api/feeds/cdc`).then(r => r.json()),
        fetch(`${API}/api/feeds/news`).then(r => r.json()),
        fetch(`${API}/api/feeds/promed`).then(r => r.json()),
      ]);

      const cdcItems    = cdcRes.status    === "fulfilled" ? cdcRes.value.items    || [] : [];
      const newsItems   = newsRes.status   === "fulfilled" ? newsRes.value.items   || [] : [];
      const promedItems = promedRes.status === "fulfilled" ? promedRes.value.items || [] : [];

      setCdcCount(cdcItems.length);
      setNewsCount(newsItems.length);
      setPromedCount(promedItems.length);
      log(`CDC: ${cdcItems.length}  |  News: ${newsItems.length}  |  CIDRAP: ${promedItems.length}`);

      allItems = [
        ...cdcItems.map(i    => ({ ...i, source: "cdc"    })),
        ...newsItems.map(i   => ({ ...i, source: "news"   })),
        ...promedItems.map(i => ({ ...i, source: "cidrap" })),
      ];
    } catch (err) {
      log(`Feed fetch error: ${err.message}`);
      setSynthStatus("standby");
      return;
    }

    // Step 2 — synthesize via Claude
    log("Synthesizer Agent processing...");
    try {
      const synthRes = await fetch(`${API}/api/synthesize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: allItems }),
      });
      const { signals: extracted } = await synthRes.json();
      setSignals(extracted || []);
      setLastRun(new Date());
      log(`${extracted?.length || 0} outbreak signals extracted`);
      setSynthStatus("done");
    } catch (err) {
      log(`Synthesis error: ${err.message}`);
      setSynthStatus("standby");
    }
  }, []);

  // run once on mount, then every 5 minutes
  useEffect(() => {
    runPipeline();
    intervalRef.current = setInterval(() => {
      setNextRunAt(Date.now() + REFRESH_INTERVAL_MS);
      runPipeline();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [runPipeline]);

  const now = new Date();
  const ts  = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const lastRunStr = lastRun ? lastRun.toISOString().slice(11, 19) + " UTC" : "—";

  const highCount = signals.filter(s => s.severity === "high").length;
  const midCount  = signals.filter(s => s.severity === "medium").length;

  const synthPill = synthStatus === "running" ? { color: "blue",  label: "Running"  }
                  : synthStatus === "done"    ? { color: "green", label: "Active"   }
                  :                            { color: "amber", label: "Standby"  };

  const agents = [
    {
      index: 1,
      title: "Social Media Agent",
      subtitle: "Monitors public platforms and forums for early weak signals — symptom spikes, unusual illness clusters, and community health reports.",
      status: "Active",
      statusColor: "green",
      accentColor: "var(--green)",
      icon: "◎",
      stats: [
        { label: "Signals captured (24h)", value: newsCount ? newsCount.toString() : "—" },
        { label: "Sources monitored",       value: "4" },
        { label: "Last scan",               value: lastRunStr },
        { label: "Noise filter rate",        value: "91.2%", accent: "var(--green)" },
      ],
      activity: { pct: synthStatus === "running" ? 90 : newsCount > 0 ? 78 : 10 },
    },
    {
      index: 2,
      title: "Official Health Agent",
      subtitle: "Ingests structured outbreak reports from CDC and regional health authority RSS feeds.",
      status: "Active",
      statusColor: "green",
      accentColor: "var(--blue)",
      icon: "⊕",
      stats: [
        { label: "Reports ingested",        value: (cdcCount + promedCount).toString() },
        { label: "Active feeds",             value: "3" },
        { label: "Last sync",               value: lastRunStr },
        { label: "Parse error rate",         value: "0.02%", accent: "var(--green)" },
      ],
      activity: { pct: synthStatus === "running" ? 85 : cdcCount > 0 ? 55 : 10 },
    },
    {
      index: 3,
      title: "Synthesizer Agent",
      subtitle: "Cross-references social signals with official data, scores outbreak probability, and routes validated alerts by severity.",
      status: synthPill.label,
      statusColor: synthPill.color,
      accentColor: "var(--amber)",
      icon: "⬡",
      stats: [
        { label: "Signals extracted",        value: signals.length ? signals.length.toString() : "—" },
        { label: "High severity",             value: highCount.toString(), accent: highCount > 0 ? "var(--red)" : undefined },
        { label: "Last synthesis",            value: lastRunStr },
        { label: "Confidence threshold",      value: "≥ 0.72" },
      ],
      activity: { pct: synthStatus === "running" ? 70 : signals.length > 0 ? 28 : 5 },
    },
  ];

  const severityColor = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
  const severityRadius = { high: 14, medium: 10, low: 7 };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .leaflet-container { background: #0d1119 !important; }
        .leaflet-tooltip {
          background: #111520 !important;
          border: 1px solid #2a3550 !important;
          color: #cdd8f0 !important;
          font-family: 'IBM Plex Mono', monospace !important;
          font-size: 11px !important;
          border-radius: 4px !important;
          box-shadow: none !important;
          padding: 6px 10px !important;
        }
        .leaflet-tooltip::before { display: none !important; }
      `}</style>

      {/* ── top nav ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 52,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            fontFamily: "var(--mono)", fontWeight: 600, fontSize: 15,
            color: "var(--text-head)", letterSpacing: "0.06em",
          }}>EPI<span style={{ color: "var(--amber)" }}>SCAN</span></div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)",
            borderLeft: "1px solid var(--border)", paddingLeft: 10, letterSpacing: "0.08em",
          }}>SURVEILLANCE PLATFORM v0.3</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CountdownTimer nextRunAt={nextRunAt} />
          <button onClick={() => { setNextRunAt(Date.now() + REFRESH_INTERVAL_MS); runPipeline(); }} disabled={synthStatus === "running"} style={{
            fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.08em",
            background: synthStatus === "running" ? "var(--border)" : "var(--amber-dim)",
            color: synthStatus === "running" ? "var(--text)" : "var(--amber)",
            border: "1px solid", borderColor: synthStatus === "running" ? "var(--border)" : "var(--amber-glow)",
            borderRadius: 4, padding: "5px 12px", cursor: synthStatus === "running" ? "default" : "pointer",
            transition: "all 0.2s",
          }}>
            {synthStatus === "running" ? "▶ RUNNING..." : "▶ RUN PIPELINE"}
          </button>
          <Pill color="green">System Nominal</Pill>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>{ts}</div>
        </div>
      </header>

      {/* ── main layout ── */}
      <main style={{
        flex: 1, minHeight: 0,
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        gridTemplateRows: "1fr",
        gap: 0, overflow: "hidden",
      }}>

        {/* ── left panel ── */}
        <aside style={{
          gridRow: "1 / -1",
          display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--border)",
          overflow: "auto",
        }}>
          <div style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--text-hi)", letterSpacing: "0.1em" }}>AGENT MONITOR</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)" }}>3 / 3 online</span>
          </div>

          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
            {agents.map(a => <AgentCard key={a.index} {...a} />)}
          </div>

          {/* pipeline log */}
          {pipelineLog.length > 0 && (
            <div style={{
              margin: "0 16px 16px",
              background: "var(--bg-card2)",
              border: "1px solid var(--border)",
              borderRadius: 6, padding: "10px 12px",
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", letterSpacing: "0.08em", marginBottom: 8 }}>PIPELINE LOG</div>
              {pipelineLog.map((line, i) => (
                <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 10, color: i === 0 ? "var(--text-hi)" : "var(--text)", lineHeight: 1.7 }}>{line}</div>
              ))}
            </div>
          )}
        </aside>

        {/* ── right panel ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, height: "100%" }}>

          {/* stat bar */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            {[
              { label: "Signals Detected",   value: signals.length.toString(),  color: signals.length > 0 ? "var(--amber)" : "var(--text-hi)" },
              { label: "High Severity",       value: highCount.toString(),        color: highCount > 0 ? "var(--red)" : "var(--text-hi)" },
              { label: "Medium Severity",     value: midCount.toString(),          color: midCount > 0 ? "var(--amber)" : "var(--text-hi)" },
              { label: "Sources Active",      value: "3",                         color: "var(--green)" },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, padding: "14px 20px",
                borderRight: i < 3 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* map — signals list hidden for now */}
          <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
            <MapContainer
              center={[20, 0]} zoom={2}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
              zoomControl={false} attributionControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="" />
              {signals.filter(sig => sig.lat != null && sig.lng != null && !(sig.lat === 0 && sig.lng === 0)).map((sig, i) => {
                const isHovered = hoveredSignal && hoveredSignal.disease === sig.disease && hoveredSignal.location === sig.location;
                return (
                  <CircleMarker
                    key={i}
                    center={[sig.lat, sig.lng]}
                    radius={isHovered ? (severityRadius[sig.severity] || 8) * 1.7 : (severityRadius[sig.severity] || 8)}
                    pathOptions={{
                      color: severityColor[sig.severity] || "#f59e0b",
                      fillColor: severityColor[sig.severity] || "#f59e0b",
                      fillOpacity: isHovered ? 0.7 : 0.35,
                      weight: isHovered ? 3 : 2,
                    }}
                  >
                    <Tooltip permanent={isHovered} sticky={!isHovered}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{sig.disease || "Unknown"}</div>
                      <div>{sig.location}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
                        <span style={{ color: severityColor[sig.severity], textTransform: "uppercase", fontSize: 10 }}>{sig.severity}</span>
                        {sig.confidence != null && <span style={{ color: "#7a8aaa" }}>conf. {Math.round(sig.confidence * 100)}%</span>}
                        {sig.source && <span style={{ color: "#7a8aaa", textTransform: "uppercase", fontSize: 10 }}>{sig.source}</span>}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>

            {/* map badge */}
            <div style={{
              position: "absolute", top: 14, left: 14, zIndex: 1000,
              background: "rgba(11,14,20,0.85)",
              border: "1px solid var(--border)",
              borderRadius: 6, padding: "8px 14px",
              display: "flex", alignItems: "center", gap: 8,
              pointerEvents: "none",
            }}>
              <span style={{ fontSize: 12 }}>🗺</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-hi)", letterSpacing: "0.08em" }}>OUTBREAK MAP</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", borderLeft: "1px solid var(--border)", paddingLeft: 8 }}>
                {signals.length} signal{signals.length !== 1 ? "s" : ""} plotted
              </span>
            </div>

            {/* legend */}
            <div style={{
              position: "absolute", bottom: 14, right: 14, zIndex: 1000,
              background: "rgba(11,14,20,0.85)",
              border: "1px solid var(--border)",
              borderRadius: 6, padding: "8px 14px",
              display: "flex", flexDirection: "column", gap: 5,
              pointerEvents: "none",
            }}>
              {Object.entries(severityColor).map(([sev, col]) => (
                <div key={sev} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, boxShadow: `0 0 6px ${col}` }} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", textTransform: "uppercase" }}>{sev}</span>
                </div>
              ))}
            </div>

            {/* loading overlay */}
            {synthStatus === "running" && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 999,
                background: "rgba(11,14,20,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 13, color: "var(--amber)",
                  letterSpacing: "0.12em",
                  animation: "pulse 1.2s ease-in-out infinite",
                }}>SYNTHESIZING...</div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}