// Shared auth helper for Netlify functions.
// Purpose: single-user app guarded by one shared admin token.

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
  const adminToken = String(process.env.ENKIDU_ADMIN_TOKEN || "").trim();
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



