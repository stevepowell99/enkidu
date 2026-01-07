// POST /api/backfill-embeddings
// Purpose: one-off backfill of embeddings for existing pages (admin-only).

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { updatePageEmbedding } = require("./_embeddings");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(200, Math.floor(n));
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const limit = parseLimit(event.queryStringParameters?.limit);

    // Fetch a batch of pages missing embeddings.
    const rows = await supabaseRequest("pages", {
      query:
        "?select=id,content_md" +
        "&embedding=is.null" +
        "&order=created_at.asc" +
        `&limit=${encodeURIComponent(limit)}`,
    });

    let updated = 0;
    const ids = [];

    for (const r of rows || []) {
      const id = String(r?.id || "");
      if (!id) continue;
      await updatePageEmbedding({ id, content_md: r?.content_md || "" });
      updated++;
      ids.push(id);
    }

    return json(200, {
      scanned: (rows || []).length,
      updated,
      ids,
      remaining_hint: updated === limit ? "More remain. Call again to process next batch." : "Done (no more null embeddings in this batch).",
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};


