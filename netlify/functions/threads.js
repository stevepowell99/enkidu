// GET /api/threads
// Purpose: list recent chat threads for a dropdown (sorted by most recent message).

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Fetch a window of recent chat pages and aggregate by thread_id.
    // Keeps it dependency-free and avoids RPC/setup complexity.
    const CHAT_TAG = "*chat";
    const rows = await supabaseRequest("pages", {
      query:
        "?select=thread_id,created_at,title,kv_tags" +
        `&tags=cs.{${encodeURIComponent(CHAT_TAG)}}` +
        "&order=created_at.desc" +
        "&limit=2000",
    });

    const latestByThread = new Map(); // thread_id -> created_at of latest message
    const titleByThread = new Map(); // thread_id -> last known thread title
    for (const r of rows || []) {
      const tid = r?.thread_id;
      if (!tid) continue;

      // First time we see a thread is the latest created_at (because rows are desc).
      if (!latestByThread.has(tid)) latestByThread.set(tid, r.created_at);

      // Thread title: prefer the most recent assistant-provided kv_tags.thread_title,
      // else fall back to the page title. (Stop once we have one.)
      if (!titleByThread.has(tid)) {
        const kv = r?.kv_tags || {};
        const fromKv = typeof kv.thread_title === "string" ? kv.thread_title.trim() : "";
        const fromTitle = typeof r?.title === "string" ? r.title.trim() : "";
        const picked = fromKv || fromTitle;
        if (picked) titleByThread.set(tid, picked);
      }
    }

    const threads = Array.from(latestByThread.entries())
      .map(([thread_id, last_created_at]) => ({
        thread_id,
        last_created_at,
        thread_title: titleByThread.get(thread_id) || "",
      }))
      .sort((a, b) => String(b.last_created_at).localeCompare(String(a.last_created_at)));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threads }),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};


