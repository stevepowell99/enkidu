// POST /api/backfill-embeddings
// Purpose: one-off backfill of embeddings for existing pages (admin-only).

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { makeEmbeddingFieldsBatchSettled } = require("./_embeddings");

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

    const scanned = (rows || []).length;
    const items = (rows || [])
      .map((r) => ({
        id: String(r?.id || ""),
        content_md: String(r?.content_md || ""),
      }))
      .filter((r) => r.id);

    const toEmbed = [];
    const failed = [];
    for (const r of items) {
      if (!r.content_md.trim()) {
        // Purpose: avoid infinite re-processing of empty pages.
        failed.push({ id: r.id, error: "Empty content_md (cannot embed)" });
        continue;
      }
      toEmbed.push(r);
    }

    const embedResults = await makeEmbeddingFieldsBatchSettled({
      contents_md: toEmbed.map((r) => r.content_md),
      taskType: "RETRIEVAL_DOCUMENT",
      concurrency: 5,
    });

    const updates = [];
    const ids = [];
    for (let i = 0; i < toEmbed.length; i++) {
      const id = toEmbed[i].id;
      const res = embedResults[i];
      if (!res?.ok) {
        failed.push({ id, error: String(res?.error || "Embedding failed") });
        continue;
      }
      updates.push({ id, ...res.fields });
      ids.push(id);
    }

    if (updates.length) {
      // Purpose: write embeddings back in one request (much faster than PATCH per page).
      await supabaseRequest("pages", {
        method: "POST",
        query: "?on_conflict=id",
        preferExtras: ["resolution=merge-duplicates"],
        returnRepresentation: false,
        body: updates,
      });
    }

    return json(200, {
      scanned,
      updated: updates.length,
      ids,
      failed,
      remaining_hint:
        updates.length === limit ? "More remain. Call again to process next batch." : "Done (no more null embeddings in this batch).",
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};


