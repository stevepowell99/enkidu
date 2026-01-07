// Server-side embeddings helper (Gemini -> Supabase pgvector).
// Purpose: keep embedding generation/storage logic in one place and call it on every page write.

const { supabaseRequest } = require("./_supabase");
const { geminiEmbed, geminiBatchEmbed } = require("./_gemini");

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

async function makeEmbeddingFields({ content_md }) {
  // Purpose: build the fields we store alongside a page row.
  const text = truncateForEmbedding(content_md);
  if (!text) return null;

  const { model, values } = await geminiEmbed({ text, taskType: "RETRIEVAL_DOCUMENT" });
  return {
    embedding: toPgvectorLiteral(values),
    embedding_model: model,
    embedding_updated_at: new Date().toISOString(),
  };
}

async function makeEmbeddingFieldsBatch({ contents_md }) {
  // Purpose: embed many pages in one API call (critical for multi-page create).
  const texts = Array.isArray(contents_md) ? contents_md.map((t) => truncateForEmbedding(t)) : [];
  const nonEmpty = texts.map((t) => t || "");

  if (!nonEmpty.length) return [];
  if (nonEmpty.some((t) => !t)) {
    // Pages require content_md, but keep it explicit.
    throw new Error("Batch embedding requires non-empty content_md for every item");
  }

  const { model, embeddings } = await geminiBatchEmbed({
    texts: nonEmpty,
    taskType: "RETRIEVAL_DOCUMENT",
  });

  if (embeddings.length !== nonEmpty.length) {
    throw new Error(`Gemini batch embed error: expected ${nonEmpty.length} embeddings, got ${embeddings.length}`);
  }

  const now = new Date().toISOString();
  return embeddings.map((values) => ({
    embedding: toPgvectorLiteral(values),
    embedding_model: model,
    embedding_updated_at: now,
  }));
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

module.exports = { makeEmbeddingFields, makeEmbeddingFieldsBatch, updatePageEmbedding };


