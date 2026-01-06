// GET /api/tags
// Purpose: return distinct tags for dropdowns in the UI.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Keep it simple: fetch tags from recent rows and uniquify.
    // (If this grows, we can replace with an RPC later.)
    const rows = await supabaseRequest("pages", {
      query: "?select=tags&order=created_at.desc&limit=1000",
    });

    const set = new Set();
    for (const r of rows || []) {
      for (const t of r?.tags || []) set.add(String(t));
    }

    const tags = Array.from(set).filter(Boolean).sort();

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};


