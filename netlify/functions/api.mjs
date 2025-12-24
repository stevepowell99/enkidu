// Netlify Functions entrypoint for Enkidu API.
// Purpose: run the same API logic as the local Node server, but in hosted mode (typically ENKIDU_STORAGE=supabase).

import { apiHandleRequest } from "../../enkidu.js";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

export async function handler(event) {
  try {
    const method = String(event.httpMethod || "GET").toUpperCase();
    const rawPath = String(event.path || "");

    // With netlify.toml redirect to "/.netlify/functions/api/:splat"
    // event.path becomes "/.netlify/functions/api/<splat>"
    const prefix = "/.netlify/functions/api";
    const tail = rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath;
    const pathname = "/api" + (tail || "");

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const searchParams = {
      get: (k) => qs.get(k),
    };

    const headers = event.headers || {};
    const bodyText = event.body ? String(event.body) : "";

    const out = await apiHandleRequest({ method, pathname, searchParams, headers, bodyText });
    return json(out.statusCode, out.json);
  } catch (err) {
    return json(500, { error: String(err?.stack || err?.message || err) });
  }
}


