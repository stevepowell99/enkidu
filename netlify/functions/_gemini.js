// Gemini (Google AI Studio) helper.
// Purpose: keep Gemini API key server-side only, and keep fetch code in one place.

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return { apiKey, model };
}

function normalizeModelName(model) {
  const m = String(model || "").trim();
  return m.startsWith("models/") ? m.slice("models/".length) : m;
}

async function geminiGenerate({ system, messages, model }) {
  const cfg = getGeminiConfig();
  const apiKey = cfg.apiKey;
  const modelName = normalizeModelName(model || cfg.model);

  // AI Studio Gemini API (Generative Language API)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    // systemInstruction is optional; keep it a single simple string for now.
    ...(system
      ? { systemInstruction: { parts: [{ text: String(system) }] } }
      : {}),
    contents: messages.map((m) => ({
      role: m.role, // "user" | "model"
      parts: [{ text: String(m.text) }],
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : `${res.status} ${res.statusText}`;
    throw new Error(`Gemini error: ${msg}`);
  }

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text;
}

module.exports = { geminiGenerate };


