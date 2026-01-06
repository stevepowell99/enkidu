// POST /api/chat
// Purpose: call Gemini, save user+assistant messages as separate pages.

const crypto = require("crypto");

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets } = require("./_secrets");
const { geminiGenerate } = require("./_gemini");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}

async function loadThreadMessages(threadId, limit) {
  const query =
    `?select=created_at,content_md,kv_tags` +
    `&thread_id=eq.${encodeURIComponent(threadId)}` +
    `&order=created_at.desc` +
    `&limit=${encodeURIComponent(limit)}`;

  const rows = await supabaseRequest("pages", { query });
  const ordered = (rows || []).slice().reverse();

  const messages = [];
  for (const r of ordered) {
    const role = r?.kv_tags?.role === "assistant" ? "model" : "user";
    messages.push({ role, text: String(r?.content_md || "") });
  }
  return messages;
}

async function loadPreferenceText() {
  // Soft-coded preferences: pages tagged with any of style/preference/habits.
  // Keep it minimal: fetch a few recent and join.
  const tags = ["style", "preference", "habits"];
  const tagFilters = tags.map((t) => `tags=cs.{${encodeURIComponent(t)}}`);

  // PostgREST doesn't support OR across query params directly; simplest is to just
  // fetch recent pages and filter in JS.
  const rows = await supabaseRequest("pages", {
    query: "?select=content_md,tags&order=created_at.desc&limit=200",
  });

  const prefs = [];
  for (const r of rows || []) {
    const rt = r?.tags || [];
    if (rt.some((t) => tags.includes(String(t)))) {
      prefs.push(String(r.content_md || ""));
      if (prefs.length >= 5) break;
    }
  }

  return prefs.length ? prefs.join("\n\n---\n\n") : "";
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "");
    let threadId = body.thread_id ? String(body.thread_id) : "";

    if (!message.trim()) return json(400, { error: "message is required" });
    assertNoSecrets(message);

    if (!threadId) threadId = crypto.randomUUID();

    const history = await loadThreadMessages(threadId, 20);
    const system = await loadPreferenceText();

    const reply = await geminiGenerate({
      system,
      messages: [...history, { role: "user", text: message }],
    });

    // Save user message
    const userRows = await supabaseRequest("pages", {
      method: "POST",
      query: "?select=id",
      body: {
        thread_id: threadId,
        title: null,
        content_md: message,
        tags: ["chat"],
        kv_tags: { role: "user" },
        next_page_id: null,
      },
    });
    const userPageId = userRows?.[0]?.id || null;

    // Save assistant reply
    assertNoSecrets(reply);
    const asstRows = await supabaseRequest("pages", {
      method: "POST",
      query: "?select=id",
      body: {
        thread_id: threadId,
        title: null,
        content_md: reply,
        tags: ["chat"],
        kv_tags: { role: "assistant" },
        next_page_id: null,
      },
    });
    const assistantPageId = asstRows?.[0]?.id || null;

    return json(200, {
      thread_id: threadId,
      reply,
      saved: { userPageId, assistantPageId },
    });
  } catch (err) {
    const msg = String(err?.message || err);
    const status = err?.code === "ENKIDU_SECRET_DETECTED" ? 400 : 500;
    return json(status, { error: msg });
  }
};


