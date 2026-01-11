// Server-side embeddings helper (Gemini -> Supabase pgvector).
// Purpose: keep embedding generation/storage logic in one place and call it on every page write.

const { supabaseRequest } = require("./_supabase");
const { geminiEmbed } = require("./_gemini");

function truncateForEmbedding(text, { maxChars = 8000 } = {}) {
  // Purpose: keep embedding latency predictable (prevents timeouts on long markdown).
  const s = String(text || "").trim();
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

function toPgvectorLiteral(values) {
  // PostgREST expects vector as a string literal like: "[0.1,0.2,0.3]"
  const nums = values.map((v) => Number(v));
  for (const n of nums) {
    if (!Number.isFinite(n)) throw new Error("Embedding contains non-finite number");
  }
  return `[${nums.join(",")}]`;
}

async function makeEmbeddingFields({ content_md, taskType = "RETRIEVAL_DOCUMENT" }) {
  // Purpose: build the fields we store alongside a page row (or embed a query when taskType=RETRIEVAL_QUERY).
  const text = truncateForEmbedding(content_md);
  if (!text) return null;

  const { model, values } = await geminiEmbed({ text, taskType });
  return {
    embedding: toPgvectorLiteral(values),
    embedding_model: model,
    embedding_updated_at: new Date().toISOString(),
  };
}

function assertNonEmptyContents(nonEmpty) {
  if (!nonEmpty.length) return;
  if (nonEmpty.some((t) => !t)) {
    // Pages require content_md, but keep it explicit (callers should filter empties).
    throw new Error("Batch embedding requires non-empty content_md for every item");
  }
}

async function mapLimit(items, limit, fn) {
  // Purpose: embed concurrently (small fixed fanout) so we don't do painfully slow serial requests.
  const xs = Array.isArray(items) ? items : [];
  const n = xs.length;
  const out = new Array(n);
  const lim = Math.max(1, Math.floor(Number(limit) || 1));

  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= n) break;
      out[i] = await fn(xs[i], i);
    }
  }

  const workers = new Array(Math.min(lim, n)).fill(0).map(() => worker());
  await Promise.all(workers);
  return out;
}

async function makeEmbeddingFieldsBatchSettled({ contents_md, taskType = "RETRIEVAL_DOCUMENT", concurrency = 5 }) {
  // Purpose: embed many pages fast without one failure blocking the whole batch.
  const texts = Array.isArray(contents_md) ? contents_md.map((t) => truncateForEmbedding(t)) : [];
  const nonEmpty = texts.map((t) => t || "");
  if (!nonEmpty.length) return [];
  assertNonEmptyContents(nonEmpty);

  const now = new Date().toISOString();
  return await mapLimit(
    nonEmpty,
    concurrency,
    async (text) => {
      try {
        const { model, values } = await geminiEmbed({ text, taskType });
        return {
          ok: true,
          fields: {
            embedding: toPgvectorLiteral(values),
            embedding_model: model,
            embedding_updated_at: now,
          },
        };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    }
  );
}

async function makeEmbeddingFieldsBatch({ contents_md }) {
  // Purpose: embed many pages (used by chat). Fail fast if any item fails.
  const settled = await makeEmbeddingFieldsBatchSettled({ contents_md, taskType: "RETRIEVAL_DOCUMENT", concurrency: 5 });
  const bad = settled.find((r) => !r?.ok);
  if (bad) throw new Error(String(bad?.error || "Batch embedding failed"));
  return settled.map((r) => r.fields);
}

async function updatePageEmbedding({ id, content_md }) {
  // Always update embedding on create/update (even if only metadata changed).
  const fields = await makeEmbeddingFields({ content_md });
  if (!fields) return;

  await supabaseRequest("pages", {
    method: "PATCH",
    query: `?id=eq.${encodeURIComponent(id)}`,
    body: {
      ...fields,
    },
  });
}

module.exports = { makeEmbeddingFields, makeEmbeddingFieldsBatch, makeEmbeddingFieldsBatchSettled, updatePageEmbedding };


