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
    // Purpose: log enough to debug auth mismatches without leaking secrets.
    // Common causes:
    // - UI token not saved (empty -> "Bearer" after trim)
    // - Server token differs from UI token (wrong .env / wrong Cloud Run env var)
    const authLower = String(auth || "").trim();
    const hasBearer = authLower.toLowerCase().startsWith("bearer");
    const gotTokenPart = hasBearer ? authLower.replace(/^bearer\s*/i, "") : "";
    const gotTokenLen = gotTokenPart.length;
    const gotTokenHash12 = gotTokenPart
      ? crypto.createHash("sha256").update(gotTokenPart).digest("hex").slice(0, 12)
      : "";
    const expectedTokenHash12 = crypto.createHash("sha256").update(adminToken).digest("hex").slice(0, 12);

    // eslint-disable-next-line no-console
    console.error("[enkidu] auth_failed", {
      path: event?.path || "",
      method: event?.httpMethod || "",
      got_prefix: auth.slice(0, 7),
      got_len: auth.length,
      got_token_len: gotTokenLen,
      got_token_hash12: gotTokenHash12,
      expected_len: expected.length,
      expected_token_hash12: expectedTokenHash12,
      server_token_len: adminTokenRaw.length,
      server_token_hash12: crypto.createHash("sha256").update(adminTokenRaw).digest("hex").slice(0, 12),
      server_token_has_delims: /[,\s]/.test(adminTokenRaw),
      origin: String(event?.headers?.origin || event?.headers?.Origin || ""),
      referer: String(event?.headers?.referer || event?.headers?.Referer || ""),
      ua: String(event?.headers?.["user-agent"] || event?.headers?.["User-Agent"] || ""),
      hint: gotTokenLen === 0 && hasBearer ? "Client sent Bearer with empty token (UI token likely blank)" : "",
    });

    // Non-sensitive hint for debugging auth mismatches across environments.
    const hint = JSON.stringify({
      got_prefix: auth.slice(0, 7), // typically "Bearer "
      got_len: auth.length,
      got_token_len: gotTokenLen,
      got_token_hash12: gotTokenHash12,
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



