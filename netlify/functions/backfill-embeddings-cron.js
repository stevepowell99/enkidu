// Scheduled embeddings backfill (background).
// Purpose: keep embeddings eventually-consistent after bulk imports that skip embeddings.

const { supabaseRequest } = require("./_supabase");
const { updatePageEmbedding } = require("./_embeddings");

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
        // Purpose: don't let one bad page block the whole backlog forever.
        failed.push({ id, error: String(err?.message || err) });
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        scheduled: true,
        scanned: (rows || []).length,
        updated,
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


