// POST /api/dream
// Purpose: manual "dream" run (user clicks). Small batch cleanup: add title/tags/kv_tags.
// Writes a dream diary page summarizing what changed.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { geminiGenerate } = require("./_gemini");
const { assertNoSecrets, isAllowSecrets } = require("./_secrets");
const { makeEmbeddingFields } = require("./_embeddings");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function uniqueStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v).trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function loadCandidates(limit) {
  // Small window of recent pages. The Dream prompt decides what to change.
  // Avoid editing prompt cards and dream diaries.
  const rows = await supabaseRequest("pages", {
    query:
      "?select=id,title,tags,kv_tags,content_md,created_at" +
      "&order=created_at.desc" +
      `&limit=${encodeURIComponent(Math.max(50, limit * 20))}`,
  });

  const out = [];
  for (const r of rows || []) {
    const tags = r?.tags || [];
    const isPromptCard =
      tags.includes("*dream-prompt") ||
      tags.includes("*split-prompt") ||
      tags.includes("*system") ||
      tags.includes("*preference");
    const isDreamDiary = tags.includes("*dream-diary");
    if (isPromptCard || isDreamDiary) continue;

    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

async function loadDreamPrompt() {
  // Dreaming prompt instructions live in a page, not hardcoded.
  // Create a page tagged "*dream-prompt" (and optionally "*preference") in the UI.
  const rows = await supabaseRequest("pages", {
    query: "?select=content_md,tags&order=created_at.desc&limit=200",
  });

  for (const r of rows || []) {
    const tags = r?.tags || [];
    if (tags.includes("*dream-prompt")) return String(r.content_md || "");
  }
  return "";
}

function extractJsonOnly(text) {
  // Expect dream model to output only JSON (no prose). If it doesn't, fail loudly.
  const t = String(text || "").trim();
  return JSON.parse(t);
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const allowSecrets = isAllowSecrets(event);
    const body = JSON.parse(event.body || "{}");
    const limit = Math.min(12, Math.max(1, Number(body.limit || 8)));

    const dreamPrompt = await loadDreamPrompt();
    if (!dreamPrompt.trim()) {
      return json(400, { error: "Missing dream prompt. Create a page tagged *dream-prompt." });
    }

    const candidates = await loadCandidates(limit);
    if (!candidates.length) {
      return json(200, { updated: 0, diaryPageId: null, candidates: 0, message: "No candidates." });
    }

    // Fast lookup so we can re-embed even when only metadata changes.
    const contentById = new Map(candidates.map((p) => [String(p.id), String(p.content_md || "")]));

    const prompt = `${dreamPrompt}\n\nPages:\n${candidates
      .map((p, i) => `#${i + 1} id=${p.id}\ncontent:\n${String(p.content_md || "").slice(0, 2000)}\n`)
      .join("\n")}`;

    const raw = await geminiGenerate({
      messages: [{ role: "user", text: prompt }],
      model: body.model ? String(body.model) : null,
    });

    const parsed = extractJsonOnly(raw);
    const updates = Array.isArray(parsed?.updates) ? parsed.updates : [];
    const summary = String(parsed?.summary || "").trim();

    let updated = 0;
    const changedIds = [];

    for (const u of updates) {
      const id = String(u?.id || "");
      if (!id) continue;

      const patch = {};
      if (u.title !== undefined) patch.title = u.title ? String(u.title) : null;
      if (u.tags !== undefined) patch.tags = Array.isArray(u.tags) ? uniqueStrings(u.tags) : [];
      if (u.kv_tags !== undefined && u.kv_tags && typeof u.kv_tags === "object") patch.kv_tags = u.kv_tags;

      if (patch.title === undefined && patch.tags === undefined && patch.kv_tags === undefined) continue;

      // Secret blocking on any new title/summary (cheap safety).
      if (patch.title) assertNoSecrets(patch.title, { allow: allowSecrets });

      await supabaseRequest("pages", {
        method: "PATCH",
        query: `?id=eq.${encodeURIComponent(id)}`,
        body: patch,
      });
      updated++;
      changedIds.push(id);
    }

    const diaryTitle = `Dream diary (${new Date().toLocaleString()})`;
    const diaryContent =
      (summary ? `${summary}\n\n` : "") +
      `Updated pages (${updated}):\n` +
      changedIds.map((id) => `- ${id}`).join("\n");

    assertNoSecrets(diaryContent, { allow: allowSecrets });
    const embed = await makeEmbeddingFields({ content_md: diaryContent });
    const diaryRows = await supabaseRequest("pages", {
      method: "POST",
      query: "?select=id",
      body: {
        title: diaryTitle,
        content_md: diaryContent,
        tags: ["*dream-diary"],
        kv_tags: { kind: "dream", updated },
        thread_id: null,
        next_page_id: null,
        ...(embed || {}),
      },
    });

    const diaryPageId = diaryRows?.[0]?.id || null;

    return json(200, {
      updated,
      diaryPageId,
      candidates: candidates.length,
      proposed: updates.length,
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};


