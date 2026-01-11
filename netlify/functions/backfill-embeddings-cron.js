// Scheduled embeddings backfill (background).
// Purpose: keep embeddings eventually-consistent after bulk imports that skip embeddings.

const { supabaseRequest } = require("./_supabase");
const { makeEmbeddingFieldsBatchSettled } = require("./_embeddings");

function parseLimitEnv() {
  const n = Number(process.env.ENKIDU_EMBEDDING_BACKFILL_LIMIT || 25);
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(200, Math.floor(n));
}

exports.handler = async () => {
  try {
    const limit = parseLimitEnv();

    // Oldest first so long-term backlog drains predictably.
    const rows = await supabaseRequest("pages", {
      query:
        "?select=id,content_md" +
        "&embedding=is.null" +
        "&order=created_at.asc" +
        `&limit=${encodeURIComponent(limit)}`,
    });

    const scanned = (rows || []).length;
    const ids = [];
    const failed = [];

    const items = (rows || [])
      .map((r) => ({
        id: String(r?.id || ""),
        content_md: String(r?.content_md || ""),
      }))
      .filter((r) => r.id);

    const toEmbed = [];
    for (const r of items) {
      if (!r.content_md.trim()) {
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
      await supabaseRequest("pages", {
        method: "POST",
        query: "?on_conflict=id",
        preferExtras: ["resolution=merge-duplicates"],
        returnRepresentation: false,
        body: updates,
      });
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        scheduled: true,
        scanned,
        updated: updates.length,
        ids,
        failed,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};

// Netlify Scheduled Function (cron syntax).
exports.config = {
  schedule: "*/15 * * * *", // every 15 minutes
};


