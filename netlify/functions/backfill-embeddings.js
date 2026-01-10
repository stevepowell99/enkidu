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

    const body = JSON.parse(event.body || "{}");
    const reqIds = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeIds = reqIds.filter((id) => uuidRe.test(id)).slice(0, limit);

    let rows = [];
    if (safeIds.length) {
      // Backfill only these ids (used after split-into-pages).
      const inList = safeIds.map((s) => encodeURIComponent(s)).join(",");
      rows = await supabaseRequest("pages", {
        query:
          `?select=id,content_md` +
          `&id=in.(${inList})` +
          `&embedding=is.null` +
          `&limit=${encodeURIComponent(safeIds.length)}`,
      });
    } else {
      // Fetch a batch of pages missing embeddings (oldest first).
      rows = await supabaseRequest("pages", {
        query:
          "?select=id,content_md" +
          "&embedding=is.null" +
          "&order=created_at.asc" +
          `&limit=${encodeURIComponent(limit)}`,
      });
    }

    let updated = 0;
    const ids = [];
    const failed = [];

    for (const r of rows || []) {
      const id = String(r?.id || "");
      if (!id) continue;
      try {
        await updatePageEmbedding({ id, content_md: r?.content_md || "" });
        updated++;
        ids.push(id);
      } catch (err) {
        // Purpose: don't let one bad page block the rest of the batch/backlog.
        failed.push({ id, error: String(err?.message || err) });
      }
    }

    return json(200, {
      scanned: (rows || []).length,
      updated,
      ids,
      failed,
      remaining_hint: updated === limit ? "More remain. Call again to process next batch." : "Done (no more null embeddings in this batch).",
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};


