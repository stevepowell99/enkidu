// GET /api/pages
// POST /api/pages
// Purpose: list/search pages and create new pages.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets } = require("./_secrets");

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(200, Math.floor(n));
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === "GET") {
      const limit = parseLimit(event.queryStringParameters?.limit);
      const tag = event.queryStringParameters?.tag;
      const threadId = event.queryStringParameters?.thread_id;
      const q = event.queryStringParameters?.q;

      // NOTE: keep this simple/robust: use ilike for search (no Postgres FTS syntax).
      // Supabase PostgREST filters:
      // - tags=cs.{tag} means tags array contains tag
      // - content_md=ilike.*q* for substring search
      const filters = [];
      if (tag) filters.push(`tags=cs.{${encodeURIComponent(tag)}}`);
      if (threadId) filters.push(`thread_id=eq.${encodeURIComponent(threadId)}`);
      if (q) filters.push(`content_md=ilike.*${encodeURIComponent(q)}*`);

      const query =
        `?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md` +
        `&order=created_at.desc` +
        `&limit=${encodeURIComponent(limit)}` +
        (filters.length ? `&${filters.join("&")}` : "");

      const rows = await supabaseRequest("pages", { query });

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pages: rows }),
      };
    }

    if (event.httpMethod === "POST") {
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
      assertNoSecrets(page.content_md);

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


