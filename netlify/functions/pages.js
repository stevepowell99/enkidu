// GET /api/pages
// POST /api/pages
// Purpose: list/search pages and create new pages.

const { requireAdmin } = require("./_auth");
const { supabaseRequest, supabaseRequestMeta } = require("./_supabase");
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

    if (event.httpMethod === "DELETE") {
      // Purpose: bulk delete (used by import scripts) without 1000s of per-page HTTP calls.
      // Safety: require an explicit confirm flag + kv filter.
      const confirm = String(event.queryStringParameters?.confirm || "").trim() === "1";
      if (!confirm) return { statusCode: 400, body: "Missing confirm=1" };

      const kvKey = event.queryStringParameters?.kv_key;
      const kvValue = event.queryStringParameters?.kv_value;
      if (!kvKey || kvValue === undefined) return { statusCode: 400, body: "kv_key and kv_value are required" };

      const obj = { [String(kvKey)]: parseKvValueFromQuery(kvValue) };
      const query = `?kv_tags=cs.${encodeURIComponent(JSON.stringify(obj))}`;

      // Get count before + after so callers can trust the result (and catch wrong env/base_url issues).
      const before = await supabaseRequestMeta("pages", {
        method: "GET",
        query: `?select=id&limit=1&kv_tags=cs.${encodeURIComponent(JSON.stringify(obj))}`,
        returnRepresentation: true,
        count: "exact",
      });
      const beforeRange = String(before.headers?.["content-range"] || "");
      const beforeTotal = Number(beforeRange.split("/")[1] || "0") || 0;

      await supabaseRequest("pages", { method: "DELETE", query, returnRepresentation: false });

      const after = await supabaseRequestMeta("pages", {
        method: "GET",
        query: `?select=id&limit=1&kv_tags=cs.${encodeURIComponent(JSON.stringify(obj))}`,
        returnRepresentation: true,
        count: "exact",
      });
      const afterRange = String(after.headers?.["content-range"] || "");
      const afterTotal = Number(afterRange.split("/")[1] || "0") || 0;

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          before: beforeTotal,
          after: afterTotal,
          deleted: Math.max(0, beforeTotal - afterTotal),
        }),
      };
    }

    if (event.httpMethod === "POST") {
      const allowSecrets = isAllowSecrets(event);
      const skipEmbeddings = String(event.headers?.["x-enkidu-skip-embeddings"] || "").trim() === "1";
      const body = JSON.parse(event.body || "{}");

      // Bulk upsert: { pages: [ {id?, title?, content_md, tags?, kv_tags?} ] }
      // Purpose: speed up import scripts by avoiding 1000s of HTTP calls.
      if (Array.isArray(body.pages)) {
        if (!skipEmbeddings) return { statusCode: 400, body: "Bulk import requires x-enkidu-skip-embeddings: 1" };
        if (body.pages.length > 500) return { statusCode: 400, body: "Bulk import max 500 pages per request" };

        const pages = body.pages.map((p) => ({
          // If id is present, PostgREST upsert (on_conflict=id) will update that row.
          ...(p?.id ? { id: String(p.id) } : {}),
          title: p?.title ?? null,
          content_md: String(p?.content_md || ""),
          tags: Array.isArray(p?.tags) ? p.tags.map(String) : [],
          kv_tags: p?.kv_tags && typeof p.kv_tags === "object" ? p.kv_tags : {},
          // Intentionally omit thread_id/next_page_id in bulk mode (keep imports from stomping manual threading).
        }));

        for (const p of pages) {
          if (!p.content_md.trim()) return { statusCode: 400, body: "content_md is required (bulk)" };
          assertNoSecrets(p.content_md, { allow: allowSecrets });
        }

        // One Supabase call for insert+update by id.
        await supabaseRequest("pages", {
          method: "POST",
          query: "?on_conflict=id",
          body: pages,
          returnRepresentation: false,
          preferExtras: ["resolution=merge-duplicates"],
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, processed: pages.length }),
        };
      }

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
      // Import scripts can opt out (explicitly) to avoid many slow embedding calls.
      if (!skipEmbeddings) {
        const embed = await makeEmbeddingFields({ content_md: page.content_md });
        if (embed) Object.assign(page, embed);
      }

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


