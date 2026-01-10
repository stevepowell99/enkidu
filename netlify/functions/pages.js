// GET /api/pages
// POST /api/pages
// Purpose: list/search pages and create new pages.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets, isAllowSecrets } = require("./_secrets");
const { makeEmbeddingFields } = require("./_embeddings");

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  // Allow larger reads for client-side features like wikilink picking (still keep a hard cap).
  return Math.min(5000, Math.floor(n));
}

function parseOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Hard cap to avoid accidental huge scans (keep it simple).
  return Math.min(500000, Math.floor(n));
}

function parseKvValueFromQuery(raw) {
  // Purpose: match the stored kv_tags JSON types (number/bool/null/string), not just strings.
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("{") || s.startsWith("[") || (s.startsWith('"') && s.endsWith('"'))) {
    try {
      return JSON.parse(s);
    } catch {
      // fall through to string
    }
  }
  return s;
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === "GET") {
      const limit = parseLimit(event.queryStringParameters?.limit);
      const offset = parseOffset(event.queryStringParameters?.offset);
      const tag = event.queryStringParameters?.tag;
      const threadId = event.queryStringParameters?.thread_id;
      const q = event.queryStringParameters?.q;
      const kvKey = event.queryStringParameters?.kv_key;
      const kvValue = event.queryStringParameters?.kv_value;
      const relatedTo = event.queryStringParameters?.related_to;
      const light = String(event.queryStringParameters?.light || "").trim() === "1";

      // Vector-related pages (server-side embeddings).
      // Used by the UI when recall search is empty and the user is typing in chat.
      if (relatedTo && String(relatedTo).trim()) {
        // IMPORTANT: embed the query as a QUERY (not a DOCUMENT), otherwise results skew badly.
        const embed = await makeEmbeddingFields({ content_md: String(relatedTo), taskType: "RETRIEVAL_QUERY" });
        if (!embed?.embedding) return { statusCode: 500, body: "Failed to embed related_to" };

        const rows = await supabaseRequest("rpc/match_pages", {
          method: "POST",
          body: { query_embedding: embed.embedding, match_count: limit },
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pages: rows }),
        };
      }

      // NOTE: keep this simple/robust: use ilike for search (no Postgres FTS syntax).
      // Supabase PostgREST filters:
      // - tags=cs.{tag} means tags array contains tag
      // - content_md=ilike.*q* for substring search
      const filters = [];
      if (tag) filters.push(`tags=cs.{${encodeURIComponent(tag)}}`);
      if (threadId) filters.push(`thread_id=eq.${encodeURIComponent(threadId)}`);
      if (q) filters.push(`content_md=ilike.*${encodeURIComponent(q)}*`);
      if ((kvKey && !kvValue) || (!kvKey && kvValue)) {
        return { statusCode: 400, body: "kv_key and kv_value must be provided together" };
      }
      if (kvKey && kvValue) {
        // JSON contains filter (match on the stored JSON value/type).
        const obj = { [String(kvKey)]: parseKvValueFromQuery(kvValue) };
        filters.push(`kv_tags=cs.${encodeURIComponent(JSON.stringify(obj))}`);
      }

      // Optional "light" mode: omit content_md for big list loads (faster; much smaller payload).
      const select = light
        ? `id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags`
        : `id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md`;
      const query =
        `?select=${select}` +
        `&order=created_at.desc` +
        `&limit=${encodeURIComponent(limit)}` +
        (offset ? `&offset=${encodeURIComponent(offset)}` : "") +
        (filters.length ? `&${filters.join("&")}` : "");

      const rows = await supabaseRequest("pages", { query });

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pages: rows }),
      };
    }

    if (event.httpMethod === "POST") {
      const allowSecrets = isAllowSecrets(event);
      const body = JSON.parse(event.body || "{}");
      const page = {
        title: body.title ?? null,
        content_md: String(body.content_md || ""),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        kv_tags: body.kv_tags && typeof body.kv_tags === "object" ? body.kv_tags : {},
        thread_id: body.thread_id ?? null,
        next_page_id: body.next_page_id ?? null,
      };

      if (!page.content_md.trim()) {
        return { statusCode: 400, body: "content_md is required" };
      }
      assertNoSecrets(page.content_md, { allow: allowSecrets });

      // Embed inline so create stays fast (no extra PATCH round-trip).
      const embed = await makeEmbeddingFields({ content_md: page.content_md });
      if (embed) Object.assign(page, embed);

      const rows = await supabaseRequest("pages", {
        method: "POST",
        query: "?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md",
        body: page,
      });

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: rows?.[0] || null }),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};


