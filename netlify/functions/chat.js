// POST /api/chat
// Purpose: call Gemini, save user+assistant messages as separate pages.

const crypto = require("crypto");

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets, isAllowSecrets } = require("./_secrets");
const { geminiGenerate } = require("./_gemini");
const { makeEmbeddingFieldsBatch } = require("./_embeddings");

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

function extractEnkiduMeta(text) {
  // Purpose: allow the model to append a JSON footer that we can parse and apply.
  //
  // Accept these common patterns at the END of the reply:
  // - raw JSON object
  // - fenced code block ```json ... ```
  // - JSON with whitespace after '{' before "enkidu_meta"
  //
  // We parse a *trailing* JSON object that contains "enkidu_meta".
  const raw = String(text || "");
  const trimmed = raw.trimEnd();

  // Try to find a trailing JSON object by scanning backwards for a parseable object.
  const tail = trimmed.slice(Math.max(0, trimmed.length - 40000)); // limit work

  function stripFences(s) {
    // Remove a single trailing fenced block wrapper if present.
    // e.g. ```json\n{...}\n```
    const t = s.trim();
    if (t.startsWith("```")) {
      const firstNl = t.indexOf("\n");
      const lastFence = t.lastIndexOf("```");
      if (firstNl >= 0 && lastFence > firstNl) {
        const inner = t.slice(firstNl + 1, lastFence).trim();
        return inner;
      }
    }
    return s;
  }

  function findTrailingJsonObject(s) {
    const t = s.trimEnd();
    // Find the last '}' and then try candidate '{' positions by scanning backwards.
    const end = t.lastIndexOf("}");
    if (end < 0) return null;

    // Backward scan for '{' and try JSON.parse on each candidate slice.
    // This is simple and robust enough for small footers.
    for (let i = end; i >= 0; i--) {
      if (t[i] !== "{") continue;
      const candidate = t.slice(i, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && parsed.enkidu_meta) {
          return { startIdx: i, endIdx: end + 1, parsed };
        }
      } catch {
        // keep scanning
      }
    }
    return null;
  }

  // First try raw tail, then try stripping fences.
  let hit = findTrailingJsonObject(tail);
  let usedStripped = false;
  if (!hit) {
    const stripped = stripFences(tail);
    if (stripped !== tail) {
      hit = findTrailingJsonObject(stripped);
      usedStripped = !!hit;
    }
  }

  if (!hit) return { cleaned: raw, meta: null };

  // Remove the JSON footer from the original reply. If we stripped fences, remove from the start
  // of the fenced block if we can find it; otherwise remove from the JSON '{' we found in tail.
  let cleaned = trimmed;
  if (usedStripped) {
    // Remove the last fenced block (best effort).
    const fenceIdx = trimmed.lastIndexOf("```");
    const fenceStart = trimmed.lastIndexOf("```", fenceIdx - 1);
    if (fenceStart >= 0) cleaned = trimmed.slice(0, fenceStart).trimEnd();
    else cleaned = trimmed.slice(0, trimmed.length - tail.length + hit.startIdx).trimEnd();
  } else {
    const absoluteStart = trimmed.length - tail.length + hit.startIdx;
    cleaned = trimmed.slice(0, absoluteStart).trimEnd();
  }

  return { cleaned, meta: hit.parsed.enkidu_meta };
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
  // Soft-coded preferences: pages tagged with any of system/style/preference/habits/bio/strategy.
  // Keep it minimal: fetch a few recent and join.
  const systemTags = ["system"];
  const prefTags = ["style", "preference", "habits", "bio", "strategy"];

  // PostgREST doesn't support OR across query params directly; simplest is to just
  // fetch recent pages and filter in JS.
  const rows = await supabaseRequest("pages", {
    query: "?select=content_md,tags&order=created_at.desc&limit=200",
  });

  // System prompt: most recent page tagged "system" wins.
  let systemText = "";
  for (const r of rows || []) {
    const rt = r?.tags || [];
    if (rt.some((t) => systemTags.includes(String(t)))) {
      systemText = String(r.content_md || "");
      break;
    }
  }

  const prefs = [];
  for (const r of rows || []) {
    const rt = r?.tags || [];
    // IMPORTANT: do not inject operational prompts (dream/split) into normal chat.
    if (rt.includes("dream-prompt") || rt.includes("split-prompt")) continue;

    if (rt.some((t) => prefTags.includes(String(t)))) {
      prefs.push(String(r.content_md || ""));
      if (prefs.length >= 5) break;
    }
  }

  const prefText = prefs.length ? prefs.join("\n\n---\n\n") : "";
  if (systemText && prefText) return `${systemText}\n\n---\n\n${prefText}`;
  return systemText || prefText || "";
}

async function loadContextPages(pageIds) {
  const ids = Array.isArray(pageIds) ? pageIds.map(String) : [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safe = ids.filter((id) => uuidRe.test(id)).slice(0, 12);
  if (!safe.length) return [];

  const inList = safe.map((s) => encodeURIComponent(s)).join(",");
  const query =
    `?select=id,title,content_md,tags,kv_tags,created_at` +
    `&id=in.(${inList})` +
    `&limit=${encodeURIComponent(safe.length)}`;

  return (await supabaseRequest("pages", { query })) || [];
}

async function createPagesFromMeta(meta, { allowSecrets } = {}) {
  // Purpose: allow "split into pages" to happen silently via the JSON footer.
  //
  // Expected shape:
  // meta.new_pages = [{ title, content_md, tags, kv_tags }]
  const pages = Array.isArray(meta?.new_pages) ? meta.new_pages : [];
  if (!pages.length) return [];

  const cleaned = [];
  for (const p of pages.slice(0, 50)) {
    const title = p?.title ? String(p.title).trim() : null;
    // Accept either `content_md` (preferred) or `content` (common mistake).
    const content_md = String(p?.content_md || p?.content || "");
    const tags = Array.isArray(p?.tags) ? p.tags.map(String) : [];
    const kv_tags = p?.kv_tags && typeof p.kv_tags === "object" ? p.kv_tags : {};

    if (!content_md.trim()) continue;
    if (title) assertNoSecrets(title, { allow: allowSecrets });
    assertNoSecrets(content_md, { allow: allowSecrets });

    cleaned.push({
      title,
      content_md,
      tags,
      kv_tags: { source: "assistant", ...kv_tags },
      thread_id: null,
      next_page_id: null,
    });
  }

  if (!cleaned.length) return [];

  // Batch embed first (1 API call), then bulk insert with embeddings inline.
  const embedFields = await makeEmbeddingFieldsBatch({
    contents_md: cleaned.map((p) => p.content_md),
  });
  for (let i = 0; i < cleaned.length; i++) cleaned[i] = { ...cleaned[i], ...embedFields[i] };

  // Bulk insert (PostgREST accepts an array body).
  const rows = await supabaseRequest("pages", {
    method: "POST",
    query: "?select=id,title",
    body: cleaned,
  });

  return rows || [];
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
    const message = String(body.message || "");
    let threadId = body.thread_id ? String(body.thread_id) : "";
    const model = body.model ? String(body.model) : null;
    const contextPageIds = body.context_page_ids || [];
    const useWebSearch = body.use_web_search === true;

    if (!message.trim()) return json(400, { error: "message is required" });
    assertNoSecrets(message, { allow: allowSecrets });

    if (!threadId) threadId = crypto.randomUUID();

    const history = await loadThreadMessages(threadId, 20);
    const prefSystem = await loadPreferenceText();
    const contextPages = await loadContextPages(contextPageIds);

    let system = prefSystem;
    if (contextPages.length) {
      const ctx = contextPages
        .map((p) => {
          const t = p.title ? `Title: ${p.title}\n` : "";
          return `---\n${t}${String(p.content_md || "")}`;
        })
        .join("\n\n");
      system = system ? `${system}\n\nSelected context pages:\n${ctx}` : `Selected context pages:\n${ctx}`;
    }

    const rawReply = await geminiGenerate({
      system,
      messages: [...history, { role: "user", text: message }],
      model,
      ...(useWebSearch ? { tools: [{ google_search: {} }] } : {}),
    });
    const { cleaned: reply, meta } = extractEnkiduMeta(rawReply);

    // Optional: split into additional pages silently via meta.new_pages.
    const createdPages = meta ? await createPagesFromMeta(meta, { allowSecrets }) : [];
    // Embed user+assistant messages in one batch to avoid timeouts.
    const [userEmbed, asstEmbed] = await makeEmbeddingFieldsBatch({ contents_md: [message, reply] });

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
        ...userEmbed,
      },
    });
    const userPageId = userRows?.[0]?.id || null;

    // Save assistant reply
    assertNoSecrets(reply, { allow: allowSecrets });
    const suggestedTags = Array.isArray(meta?.suggested_tags) ? meta.suggested_tags : [];
    const suggestedTitle =
      typeof meta?.suggested_title === "string" && meta.suggested_title.trim()
        ? meta.suggested_title.trim()
        : null;
    const suggestedThreadTitle =
      typeof meta?.suggested_thread_title === "string" ? meta.suggested_thread_title.trim() : "";
    const suggestedKv =
      meta?.suggested_kv_tags && typeof meta.suggested_kv_tags === "object"
        ? meta.suggested_kv_tags
        : {};

    const assistantTags = uniqueStrings(["chat", ...suggestedTags]);
    // If suggested_thread_title is blank, keep whatever title exists in older messages.
    const assistantKv = {
      ...suggestedKv,
      role: "assistant",
      ...(suggestedThreadTitle ? { thread_title: suggestedThreadTitle } : {}),
    };

    const asstRows = await supabaseRequest("pages", {
      method: "POST",
      query: "?select=id",
      body: {
        thread_id: threadId,
        title: suggestedTitle,
        content_md: reply,
        tags: assistantTags,
        kv_tags: assistantKv,
        next_page_id: null,
        ...asstEmbed,
      },
    });
    const assistantPageId = asstRows?.[0]?.id || null;

    return json(200, {
      thread_id: threadId,
      reply,
      meta: meta || null,
      created_pages: createdPages.map((p) => p.id),
      saved: { userPageId, assistantPageId },
    });
  } catch (err) {
    const msg = String(err?.message || err);
    const status = err?.code === "ENKIDU_SECRET_DETECTED" ? 400 : 500;
    return json(status, { error: msg });
  }
};


