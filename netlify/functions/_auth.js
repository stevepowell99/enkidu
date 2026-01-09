// Shared auth helper for Netlify functions.
// Purpose: single-user app guarded by one shared admin token.

const crypto = require("crypto");

function getAuthHeader(headers) {
  // Netlify normalizes header keys to lowercase, but we support both to be safe.
  return headers?.authorization || headers?.Authorization || "";
}

function normalizeAuthHeaderValue(v) {
  // Purpose: be tolerant of harmless whitespace differences across proxies/clients.
  // Keep strict semantics: still requires "Bearer <token>".
  return String(v || "")
    .trim()
    .replace(/\s+/g, " "); // collapse runs of whitespace
}

function requireAdmin(event) {
  // Be defensive: Cloud Run / CLI mistakes can accidentally append other env vars into this value.
  // We only use the first token before any whitespace/comma.
  const adminTokenRaw = String(process.env.ENKIDU_ADMIN_TOKEN || "").trim();
  const adminToken = adminTokenRaw.split(/[,\s]/g)[0] || "";
  if (!adminToken) {
    return {
      ok: false,
      response: {
        statusCode: 500,
        body: "Missing ENKIDU_ADMIN_TOKEN on server",
      },
    };
  }

  const auth = normalizeAuthHeaderValue(getAuthHeader(event.headers));
  const expected = normalizeAuthHeaderValue(`Bearer ${adminToken}`);
  if (auth !== expected) {
    // Non-sensitive hint for debugging auth mismatches across environments.
    const hint = JSON.stringify({
      got_prefix: auth.slice(0, 7), // typically "Bearer "
      got_len: auth.length,
      expected_len: expected.length,
      server_token_len: adminTokenRaw.length,
      server_token_hash12: crypto.createHash("sha256").update(adminTokenRaw).digest("hex").slice(0, 12),
      server_token_has_delims: /[,\s]/.test(adminTokenRaw),
    });
    return {
      ok: false,
      response: {
        statusCode: 401,
        body: `Unauthorized\n${hint}`,
      },
    };
  }

  return { ok: true };
}

module.exports = { requireAdmin };



