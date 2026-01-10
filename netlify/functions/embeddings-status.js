// GET /api/embeddings-status
// Purpose: small status endpoint for the UI (shows whether background embedding backfill is working).

const { requireAdmin } = require("./_auth");
const { supabaseRequestMeta } = require("./_supabase");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function parseContentRangeTotal(contentRange) {
  // Typical: "0-0/123" or "*/0"
  const s = String(contentRange || "");
  const parts = s.split("/");
  if (parts.length !== 2) return null;
  const n = Number(parts[1]);
  return Number.isFinite(n) ? n : null;
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    // Count pages where embedding is missing.
    const res = await supabaseRequestMeta("pages", {
      method: "GET",
      query: "?select=id&embedding=is.null&limit=1",
      count: "exact",
      returnRepresentation: true,
    });

    const total = parseContentRangeTotal(res.headers?.["content-range"]);
    return json(200, {
      missing_embeddings: total ?? 0,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};



