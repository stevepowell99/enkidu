// Supabase PostgREST helper.
// Purpose: keep dependencies minimal by using fetch instead of adding supabase-js.

// Netlify dev (lambda-local) can hang until timeout if Node's fetch keeps sockets alive.
// Configure undici to close idle sockets quickly (safe in prod; helps a lot in local dev).
try {
  // eslint-disable-next-line global-require
  const { setGlobalDispatcher, Agent } = require("undici");
  setGlobalDispatcher(new Agent({ keepAliveTimeout: 50, keepAliveMaxTimeout: 50 }));
} catch {
  // If undici isn't available for some reason, do nothing.
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  // Supabase now offers "secret" keys; we still store it in this env var name.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRequest(path, { method = "GET", body, query = "" } = {}) {
  const { url, key } = getSupabaseConfig();

  // Purpose: PostgREST returns minimal responses for writes unless Prefer is set.
  // We rely on returned rows (e.g., new page id) in the UI.
  const preferReturnRepresentation = method && String(method).toUpperCase() !== "GET";

  const timeoutMs = Number(process.env.ENKIDU_HTTP_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${url}/rest/v1/${path}${query}`, {
      method,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(preferReturnRepresentation ? { Prefer: "return=representation" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Ensure timers don't linger in lambda-local (even on abort).
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("aborted")) {
      throw new Error(`Supabase request timed out after ${timeoutMs}ms: ${path}${query}`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  if (!res.ok) {
    const msg = text || `${res.status} ${res.statusText}`;
    throw new Error(`Supabase error: ${msg}`);
  }

  return text ? JSON.parse(text) : null;
}

module.exports = { supabaseRequest };



