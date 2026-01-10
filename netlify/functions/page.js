// GET/PUT/DELETE /api/page?id=...
// Purpose: single-page fetch/update/delete using a query param (keeps Netlify routing simple).

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets, isAllowSecrets } = require("./_secrets");
const { makeEmbeddingFields } = require("./_embeddings");

function getId(event) {
  return event.queryStringParameters?.id || "";
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  const id = getId(event);
  if (!id) return { statusCode: 400, body: "Missing id" };

  try {
    if (event.httpMethod === "GET") {
      const rows = await supabaseRequest(
        `pages`,
        {
          query:
            `?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md` +
            `&id=eq.${encodeURIComponent(id)}` +
            `&limit=1`,
        }
      );
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: rows?.[0] || null }),
      };
    }

    if (event.httpMethod === "PUT") {
      const allowSecrets = isAllowSecrets(event);
      const skipEmbeddings = String(event.headers?.["x-enkidu-skip-embeddings"] || "").trim() === "1";
      const body = JSON.parse(event.body || "{}");

      // Only allow updating these fields.
      const patch = {};
      if (body.title !== undefined) patch.title = body.title ?? null;
      if (body.content_md !== undefined) patch.content_md = String(body.content_md || "");
      if (body.tags !== undefined)
        patch.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
      if (body.kv_tags !== undefined)
        patch.kv_tags = body.kv_tags && typeof body.kv_tags === "object" ? body.kv_tags : {};
      if (body.thread_id !== undefined) patch.thread_id = body.thread_id ?? null;
      if (body.next_page_id !== undefined) patch.next_page_id = body.next_page_id ?? null;

      if (patch.content_md !== undefined) {
        if (!patch.content_md.trim()) return { statusCode: 400, body: "content_md is required" };
        assertNoSecrets(patch.content_md, { allow: allowSecrets });

        // Embed inline so update stays fast (no extra PATCH round-trip).
        // Import scripts can opt out (explicitly) to avoid many slow embedding calls.
        if (!skipEmbeddings) {
          const embed = await makeEmbeddingFields({ content_md: patch.content_md });
          if (embed) Object.assign(patch, embed);
        }
      }

      const rows = await supabaseRequest(`pages`, {
        method: "PATCH",
        query:
          `?id=eq.${encodeURIComponent(id)}` +
          `&select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md`,
        body: patch,
      });

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: rows?.[0] || null }),
      };
    }

    if (event.httpMethod === "DELETE") {
      await supabaseRequest(`pages`, {
        method: "DELETE",
        query: `?id=eq.${encodeURIComponent(id)}`,
      });
      return { statusCode: 200, body: "OK" };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};


