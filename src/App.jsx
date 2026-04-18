import { useState } from "react";
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

export default function App() {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  async function testAgent() {
    setLoading(true);
    setResponse("");
    const res = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "In one sentence, what is an epidemic?" }
        ],
      }),
    });

    const data = await res.json();
    console.log("API response:", data);
    if (data.content && data.content[0]) {
      setResponse(data.content[0].text);
    } else {
      setResponse(JSON.stringify(data));
    }
    setLoading(false);
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>EpiScan API Test</h1>
      <button onClick={testAgent} disabled={loading}>
        {loading ? "Calling API..." : "Test Dedalus Key"}
      </button>
      {response && <p style={{ marginTop: "1rem" }}>{response}</p>}
    </div>
  );
}