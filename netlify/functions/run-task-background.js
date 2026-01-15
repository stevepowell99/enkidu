// POST /api/run-task-background  (Netlify Background Function)
// Purpose: run a queued long chat task asynchronously and write result back to Supabase.
// Notes:
// - This is used to avoid Netlify's ~30s request wall for slow model calls.
// - Task state is stored in `pages` rows (no migrations): tags include "*task"; kv_tags.task_status.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { isAllowSecrets } = require("./_secrets");

// Reuse the transcript-mode chat runner from /api/chat to avoid duplicated logic.
const { runTranscriptChatTask } = require("./chat");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}

async function getPageById(id) {
  const rows = await supabaseRequest("pages", {
    query:
      `?select=id,thread_id,title,content_md,tags,kv_tags,created_at,updated_at` +
      `&id=eq.${encodeURIComponent(id)}` +
      `&limit=1`,
  });
  return rows?.[0] || null;
}

async function patchTask(id, patch) {
  const rows = await supabaseRequest("pages", {
    method: "PATCH",
    query: `?id=eq.${encodeURIComponent(id)}&select=id,thread_id,title,tags,kv_tags,content_md,created_at,updated_at`,
    body: patch,
  });
  return rows?.[0] || null;
}

exports.handler = async (event, context) => {
  // Netlify best practice (avoid hanging on open sockets).
  if (context) context.callbackWaitsForEmptyEventLoop = false;

  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const allowSecrets = isAllowSecrets(event);

  try {
    const body = JSON.parse(event.body || "{}");
    const taskId = String(body.task_id || "").trim();
    if (!taskId) return json(400, { error: "task_id is required" });

    const task = await getPageById(taskId);
    if (!task) return json(404, { error: "Task not found" });

    const kv = task.kv_tags && typeof task.kv_tags === "object" ? task.kv_tags : {};
    const status = String(kv.task_status || "").trim();
    if (status === "done") return json(200, { ok: true, task_id: taskId, status: "done" });
    if (status === "running") return json(200, { ok: true, task_id: taskId, status: "running" });

    // Mark running.
    const runningKv = { ...kv, task_status: "running", task_started_at: new Date().toISOString() };
    await patchTask(taskId, { kv_tags: runningKv });

    // Give slow Gemini calls more headroom (separate from normal chat).
    // Keep this isolated to this function invocation.
    const asyncTimeoutMsRaw = Number(process.env.ENKIDU_ASYNC_HTTP_TIMEOUT_MS || 120000);
    const asyncTimeoutMs = Number.isFinite(asyncTimeoutMsRaw) && asyncTimeoutMsRaw > 0 ? Math.floor(asyncTimeoutMsRaw) : 120000;
    process.env.ENKIDU_HTTP_TIMEOUT_MS = String(asyncTimeoutMs);

    const out = await runTranscriptChatTask({
      taskPage: task,
      allowSecrets,
      allowWebSearch: kv.task_use_web_search === true,
    });

    await patchTask(taskId, {
      kv_tags: {
        ...runningKv,
        task_status: "done",
        task_done_at: new Date().toISOString(),
        // Store the full reply in content_md (unbounded) and a short preview in kv_tags.
        task_reply_preview: String(out?.reply || "").slice(0, 500),
      },
      content_md: String(out?.reply || ""),
    });

    return json(200, { ok: true, task_id: taskId, status: "done" });
  } catch (err) {
    const msg = String(err?.message || err);
    try {
      const body = JSON.parse(event.body || "{}");
      const taskId = String(body.task_id || "").trim();
      if (taskId) {
        const task = await getPageById(taskId);
        const kv = task?.kv_tags && typeof task.kv_tags === "object" ? task.kv_tags : {};
        await patchTask(taskId, {
          kv_tags: { ...kv, task_status: "error", task_error: msg, task_done_at: new Date().toISOString() },
        });
      }
    } catch {
      // ignore (best-effort)
    }
    return json(500, { error: msg });
  }
};

