// Supabase PostgREST helper.
// Purpose: keep dependencies minimal by using fetch instead of adding supabase-js.

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

  const res = await fetch(`${url}/rest/v1/${path}${query}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    const msg = text || `${res.status} ${res.statusText}`;
    throw new Error(`Supabase error: ${msg}`);
  }

  return text ? JSON.parse(text) : null;
}

module.exports = { supabaseRequest };


