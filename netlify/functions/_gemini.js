// Gemini (Google AI Studio) helper.
// Purpose: keep Gemini API key server-side only, and keep fetch code in one place.

// Netlify dev (lambda-local) can hang until timeout if Node's fetch keeps sockets alive.
// Configure undici to close idle sockets quickly (safe in prod; helps a lot in local dev).
try {
  // eslint-disable-next-line global-require
  const { setGlobalDispatcher, Agent } = require("undici");
  setGlobalDispatcher(new Agent({ keepAliveTimeout: 50, keepAliveMaxTimeout: 50 }));
} catch {
  // If undici isn't available for some reason, do nothing.
}

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  // Default model (Jan 2026): keep aligned with the UI default.
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  // Default embeddings model: stable + cheap enough for personal scale.
  const embedModel = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return { apiKey, model, embedModel };
}

function normalizeModelName(model) {
  const m = String(model || "").trim();
  return m.startsWith("models/") ? m.slice("models/".length) : m;
}

async function geminiGenerate({ system, messages, model, tools } = {}) {
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
    ...(Array.isArray(tools) && tools.length ? { tools } : {}),
  };

  const timeoutMs = Number(process.env.ENKIDU_HTTP_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("aborted")) {
      throw new Error(`Gemini generate timed out after ${timeoutMs}ms (model=${modelName})`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : `${res.status} ${res.statusText}`;
    throw new Error(`Gemini error: ${msg}`);
  }

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text;
}

async function geminiEmbed({ text, model, taskType = "RETRIEVAL_DOCUMENT" }) {
  // Purpose: server-side embeddings for storing in pgvector.
  const cfg = getGeminiConfig();
  const apiKey = cfg.apiKey;
  const modelName = normalizeModelName(model || cfg.embedModel);

  // AI Studio Gemini API (Generative Language API)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    content: { parts: [{ text: String(text || "") }] },
    taskType,
  };

  const timeoutMs = Number(process.env.ENKIDU_HTTP_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("aborted")) {
      throw new Error(`Gemini embed timed out after ${timeoutMs}ms (model=${modelName})`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : `${res.status} ${res.statusText}`;
    throw new Error(`Gemini embed error: ${msg}`);
  }

  const values = json?.embedding?.values;
  if (!Array.isArray(values) || !values.length) {
    throw new Error(`Gemini embed error: missing embedding.values`);
  }
  return { model: modelName, values };
}

async function geminiBatchEmbed({ texts, model, taskType = "RETRIEVAL_DOCUMENT" }) {
  // Purpose: batch embeddings to avoid per-page API calls (important for multi-page writes).
  const cfg = getGeminiConfig();
  const apiKey = cfg.apiKey;
  const modelName = normalizeModelName(model || cfg.embedModel);

  const items = Array.isArray(texts) ? texts.map((t) => String(t || "")) : [];
  if (!items.length) return { model: modelName, embeddings: [] };

  // AI Studio Gemini API (Generative Language API)
  // NOTE: This method is exposed as `models/{model}:batchEmbedContents` for API-key usage.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;

  const body = {
    requests: items.map((text) => ({
      content: { parts: [{ text }] },
      taskType,
    })),
  };

  const timeoutMs = Number(process.env.ENKIDU_HTTP_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("aborted")) {
      throw new Error(`Gemini batch embed timed out after ${timeoutMs}ms (model=${modelName})`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : `${res.status} ${res.statusText}`;
    throw new Error(`Gemini batch embed error (model=${modelName}): ${msg}`);
  }

  const embeddings = json?.embeddings;
  if (!Array.isArray(embeddings)) {
    throw new Error(`Gemini batch embed error: missing embeddings[]`);
  }

  const out = embeddings.map((e) => e?.values);
  if (out.some((v) => !Array.isArray(v) || !v.length)) {
    throw new Error(`Gemini batch embed error: missing embeddings[].values`);
  }

  return { model: modelName, embeddings: out };
}

module.exports = { geminiGenerate, geminiEmbed, geminiBatchEmbed };


