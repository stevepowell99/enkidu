// Shared auth helper for Netlify functions.
// Purpose: single-user app guarded by one shared admin token.

function getAuthHeader(headers) {
  // Netlify normalizes header keys to lowercase, but we support both to be safe.
  return headers?.authorization || headers?.Authorization || "";
}

function requireAdmin(event) {
  const adminToken = process.env.ENKIDU_ADMIN_TOKEN;
  if (!adminToken) {
    return {
      ok: false,
      response: {
        statusCode: 500,
        body: "Missing ENKIDU_ADMIN_TOKEN on server",
      },
    };
  }

  const auth = getAuthHeader(event.headers);
  const expected = `Bearer ${adminToken}`;
  if (auth !== expected) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        body: "Unauthorized",
      },
    };
  }

  return { ok: true };
}

module.exports = { requireAdmin };


