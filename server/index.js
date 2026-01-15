// Cloud Run API server (Express).
// Purpose: run the existing Netlify Functions API without Netlify/lambda-local 30s limits.
// Also supports a SINGLE local dev mode where UI + API are same-origin (serves `public/`).

const express = require("express");
const fs = require("fs");
const path = require("path");

// -------------------------
// .env loader (simple, local-dev friendly)
// -------------------------
// Purpose: keep local dev simple (no extra tools) by reading a local `.env` file if present.
// Notes:
// - Only sets keys that are not already in process.env
// - Supports basic KEY=VALUE lines, ignores blank lines and comments (# ...)
function loadDotEnvIfPresent() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line0 of raw.split(/\r?\n/)) {
      const line = String(line0 || "").trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      let val = line.slice(eq + 1).trim();
      // Strip surrounding quotes if present.
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // Keep startup robust: if .env is malformed, don't crash the server.
  }
}
loadDotEnvIfPresent();

// -------------------------
// Debug logging (opt-in)
// -------------------------
// Purpose: make it easy to debug local issues without spamming normal runs.
const DEBUG_HTTP = String(process.env.ENKIDU_DEBUG_HTTP || "").trim() === "1";
function safeHeaderValue(v, { max = 200 } = {}) {
  const s = String(v || "");
  if (s.length <= max) return s;
  return s.slice(0, max) + `...(truncated ${s.length})`;
}

// -------------------------
// Netlify function adapter
// -------------------------

function toNetlifyEvent(req) {
  // Netlify function `event` shape subset used in this repo.
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[String(k).toLowerCase()] = String(v);

  const queryStringParameters = {};
  for (const [k, v] of Object.entries(req.query || {})) {
    if (Array.isArray(v)) queryStringParameters[k] = String(v[0] ?? "");
    else queryStringParameters[k] = String(v ?? "");
  }

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? null
      : typeof req.body === "string"
        ? req.body
        : req.body == null
          ? null
          : JSON.stringify(req.body);

  return {
    httpMethod: req.method,
    path: req.path,
    headers,
    queryStringParameters,
    body,
  };
}

async function runNetlifyHandler(handler, req, res) {
  const event = toNetlifyEvent(req);
  const context = { callbackWaitsForEmptyEventLoop: false };

  let out;
  try {
    out = await handler(event, context);
  } catch (e) {
    res.status(500).type("text/plain").send(String(e?.message || e));
    return;
  }

  const status = Number(out?.statusCode || 200);
  const headers = out?.headers && typeof out.headers === "object" ? out.headers : {};
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  const body = out?.body ?? "";
  res.status(status).send(body);
}

// -------------------------
// App
// -------------------------

const app = express();

// Request log (opt-in)
app.use((req, res, next) => {
  if (!DEBUG_HTTP) return next();
  const started = Date.now();
  const rid = Math.random().toString(16).slice(2, 10);
  res.setHeader("x-enkidu-request-id", rid);
  // eslint-disable-next-line no-console
  console.error("[enkidu] http_in", {
    rid,
    method: req.method,
    path: req.path,
    origin: safeHeaderValue(req.headers.origin),
    referer: safeHeaderValue(req.headers.referer),
    ua: safeHeaderValue(req.headers["user-agent"]),
  });
  res.on("finish", () => {
    // eslint-disable-next-line no-console
    console.error("[enkidu] http_out", { rid, status: res.statusCode, ms: Date.now() - started });
  });
  next();
});

// Body: forward raw JSON text to match Netlify behavior.
app.use(express.text({ type: "*/*", limit: "5mb" }));

// CORS (API-only: UI hosted elsewhere).
// Keep simple: allow configured origin(s).
// - ENKIDU_CORS_ORIGIN="*" allows all (ok for testing).
// - Otherwise, set a comma-separated allowlist, e.g.:
//   ENKIDU_CORS_ORIGIN="http://localhost:8888,https://enkidu-agent.netlify.app"
app.use((req, res, next) => {
  const reqOrigin = String(req.headers.origin || "").trim();
  const raw = String(process.env.ENKIDU_CORS_ORIGIN || "*").trim();
  const allowed = raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const allowAll = allowed.includes("*");
  const cleanedOrigin = reqOrigin.replace(/\/+$/, "");
  const match = allowAll ? cleanedOrigin || "*" : cleanedOrigin && allowed.includes(cleanedOrigin) ? cleanedOrigin : "";

  // IMPORTANT: always set Vary so caches don't mix origins.
  res.setHeader("vary", "origin");
  if (match) {
    // When allowAll, echo back the caller origin (more compatible than "*").
    res.setHeader("access-control-allow-origin", match);
  }
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "authorization,content-type,x-enkidu-allow-secrets"
  );
  res.setHeader("access-control-max-age", "600");

  if (String(process.env.ENKIDU_DEBUG_CORS || "").trim() === "1") {
    // eslint-disable-next-line no-console
    console.error("[enkidu] cors", {
      method: req.method,
      path: req.path,
      origin: reqOrigin,
      allowAll,
      match,
      allowed,
    });
  }

  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

// Healthcheck
app.get("/healthz", (_req, res) => res.status(200).type("text/plain").send("ok"));

// Wire existing handlers.
const chat = require("../netlify/functions/chat").handler;
const pages = require("../netlify/functions/pages").handler;
const page = require("../netlify/functions/page").handler;
const tags = require("../netlify/functions/tags").handler;
const models = require("../netlify/functions/models").handler;
const threads = require("../netlify/functions/threads").handler;
const dream = require("../netlify/functions/dream").handler;
const backfillEmbeddings = require("../netlify/functions/backfill-embeddings").handler;
const embeddingsStatus = require("../netlify/functions/embeddings-status").handler;
const runTaskBackground = require("../netlify/functions/run-task-background").handler;

app.all("/api/chat", (req, res) => runNetlifyHandler(chat, req, res));
app.all("/api/pages", (req, res) => runNetlifyHandler(pages, req, res));
app.all("/api/page", (req, res) => runNetlifyHandler(page, req, res));
app.all("/api/tags", (req, res) => runNetlifyHandler(tags, req, res));
app.all("/api/models", (req, res) => runNetlifyHandler(models, req, res));
app.all("/api/threads", (req, res) => runNetlifyHandler(threads, req, res));
app.all("/api/dream", (req, res) => runNetlifyHandler(dream, req, res));
app.all("/api/backfill-embeddings", (req, res) => runNetlifyHandler(backfillEmbeddings, req, res));
app.all("/api/embeddings-status", (req, res) => runNetlifyHandler(embeddingsStatus, req, res));
app.all("/api/run-task-background", (req, res) => runNetlifyHandler(runTaskBackground, req, res));

// -------------------------
// Local dev: serve the UI (same-origin, no CORS)
// -------------------------
// Purpose: single local mode that "just works" for everything:
// - UI: GET / (and static assets) from `public/`
// - API: /api/* routed above
const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // Fallback to the SPA entry for non-API routes.
  app.get("*", (req, res) => {
    if (String(req.path || "").startsWith("/api/")) return res.status(404).type("text/plain").send("Not Found");
    if (req.path === "/healthz") return res.status(404).type("text/plain").send("Not Found");
    return res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  // Default 404 (API-only mode)
  app.use((_req, res) => res.status(404).type("text/plain").send("Not Found"));
}

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[enkidu] server listening on :${port}`);
});


