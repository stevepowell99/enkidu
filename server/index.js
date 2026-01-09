// Cloud Run API server (Express).
// Purpose: run the existing Netlify Functions API without Netlify/lambda-local 30s limits.
// This is API-only (the UI can stay on Netlify or any static host).

const express = require("express");

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

// Body: forward raw JSON text to match Netlify behavior.
app.use(express.text({ type: "*/*", limit: "5mb" }));

// CORS (API-only: UI hosted elsewhere).
// Keep simple: allow configured origin, default "*".
app.use((req, res, next) => {
  const origin = process.env.ENKIDU_CORS_ORIGIN || "*";
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "authorization,content-type,x-enkidu-allow-secrets"
  );
  res.setHeader("access-control-max-age", "600");
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

app.all("/api/chat", (req, res) => runNetlifyHandler(chat, req, res));
app.all("/api/pages", (req, res) => runNetlifyHandler(pages, req, res));
app.all("/api/page", (req, res) => runNetlifyHandler(page, req, res));
app.all("/api/tags", (req, res) => runNetlifyHandler(tags, req, res));
app.all("/api/models", (req, res) => runNetlifyHandler(models, req, res));
app.all("/api/threads", (req, res) => runNetlifyHandler(threads, req, res));
app.all("/api/dream", (req, res) => runNetlifyHandler(dream, req, res));
app.all("/api/backfill-embeddings", (req, res) => runNetlifyHandler(backfillEmbeddings, req, res));

// Default 404
app.use((_req, res) => res.status(404).type("text/plain").send("Not Found"));

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[enkidu] server listening on :${port}`);
});


