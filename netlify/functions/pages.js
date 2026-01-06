// GET /api/pages
// Purpose: minimal endpoint to prove auth + Supabase reads are working.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(200, Math.floor(n));
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const limit = parseLimit(event.queryStringParameters?.limit);

    // Keep response small: just the fields we need for now.
    const query =
      `?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md` +
      `&order=created_at.desc` +
      `&limit=${encodeURIComponent(limit)}`;

    const rows = await supabaseRequest("pages", { query });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pages: rows }),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};


