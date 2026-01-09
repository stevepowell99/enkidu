// POST /api/chat
// Purpose: call Gemini, save user+assistant messages as separate pages.

const crypto = require("crypto");

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets, isAllowSecrets } = require("./_secrets");
const { geminiGenerate } = require("./_gemini");
const { makeEmbeddingFieldsBatch } = require("./_embeddings");
const { toolManifestShortText, executeTool } = require("./_agent_tools");

function dumpActiveHandles(label) {
  // Purpose: debug Netlify dev (lambda-local) timeouts where the response succeeds but the event loop won't drain.
  // Opt-in via env: ENKIDU_DEBUG_HANDLES=1
  //
  // Note: uses Node internals; keep it local-dev only.
  const handles = typeof process._getActiveHandles === "function" ? process._getActiveHandles() : [];
  const requests = typeof process._getActiveRequests === "function" ? process._getActiveRequests() : [];

  function describe(h) {
    try {
      const name = h?.constructor?.name || typeof h;
      if (name === "Socket") {
        const r = h.remoteAddress ? `${h.remoteAddress}:${h.remotePort || ""}` : "";
        const l = h.localAddress ? `${h.localAddress}:${h.localPort || ""}` : "";
        const host = h.servername ? ` servername=${h.servername}` : "";
        return `Socket local=${l} remote=${r}${host}`;
      }
      if (name === "TLSSocket") {
        const r = h.remoteAddress ? `${h.remoteAddress}:${h.remotePort || ""}` : "";
        const host = h.servername ? ` servername=${h.servername}` : "";
        return `TLSSocket remote=${r}${host}`;
      }
      if (name === "Timeout") return "Timeout";
      if (name === "Immediate") return "Immediate";
      return name;
    } catch {
      return "UnknownHandle";
    }
  }

  const summary = {};
  for (const h of handles) {
    const k = h?.constructor?.name || "unknown";
    summary[k] = (summary[k] || 0) + 1;
  }

  console.error(
    `[enkidu] debug_handles ${label}: handles=${handles.length} requests=${requests.length} byType=${JSON.stringify(summary)}`
  );
  // Print a small sample so you can spot which sockets are hanging around.
  for (const h of handles.slice(0, 12)) {
    console.error(`[enkidu] debug_handles sample: ${describe(h)}`);
  }
}

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

const KIND_TAGS = new Set([
  "*chat",
  "*note",
  "*preference",
  "*bio",
  "*strategy",
  "*task",
  "*decision",
  "*question",
]);

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

function extractEnkiduAgentEnvelope(text) {
  // Purpose: parse the agent envelope emitted by the model for planning/tool use.
  //
  // Expected shapes (preferably the entire response):
  // - {"enkidu_agent":{"type":"plan","text":"..."}}
  // - {"enkidu_agent":{"type":"tool_call","id":"...","name":"search_pages","args":{...}}}
  // - {"enkidu_agent":{"type":"final","text":"..."}}
  //
  // We parse either:
  // - the whole response as JSON, or
  // - a trailing JSON object containing "enkidu_agent".
  const raw = String(text || "");
  const trimmed = raw.trim();
  if (!trimmed) return { cleaned: raw, agent: null };

  function stripFences(s) {
    const t = s.trim();
    if (t.startsWith("```")) {
      const firstNl = t.indexOf("\n");
      const lastFence = t.lastIndexOf("```");
      if (firstNl >= 0 && lastFence > firstNl) return t.slice(firstNl + 1, lastFence).trim();
    }
    return s;
  }

  function tryParseObject(s) {
    const t = stripFences(String(s || "").trim());
    if (!t.startsWith("{") || !t.endsWith("}")) return null;
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object" && parsed.enkidu_agent) return parsed.enkidu_agent;
    } catch {
      return null;
    }
    return null;
  }

  // Fast path: whole response is JSON.
  const whole = tryParseObject(trimmed);
  if (whole) return { cleaned: "", agent: whole };

  // Slow path: find trailing JSON object.
  const tail = trimmed.slice(Math.max(0, trimmed.length - 40000));
  const end = tail.lastIndexOf("}");
  if (end < 0) return { cleaned: raw, agent: null };
  for (let i = end; i >= 0; i--) {
    if (tail[i] !== "{") continue;
    const candidate = tail.slice(i, end + 1);
    const agent = tryParseObject(candidate);
    if (agent) return { cleaned: trimmed.slice(0, trimmed.length - tail.length + i).trimEnd(), agent };
  }

  return { cleaned: raw, agent: null };
}

async function loadSystemPromptText() {
  // Purpose: load the most recent *system base page.
  const rows = await supabaseRequest("pages", {
    query:
      "?select=content_md" +
      `&tags=cs.{${encodeURIComponent("*system")}}` +
      "&order=created_at.desc" +
      "&limit=1",
  });
  return String(rows?.[0]?.content_md || "");
}

async function loadPreferenceBasePagesText() {
  // Purpose: load the most recent preference base pages (kept small to avoid OOM on Cloud Run).
  const tags = ["*style", "*bio", "*strategy", "*habits", "*preference"];
  const parts = [];
  for (const t of tags) {
    const rows = await supabaseRequest("pages", {
      query:
        "?select=content_md" +
        `&tags=cs.{${encodeURIComponent(t)}}` +
        "&order=created_at.desc" +
        "&limit=1",
    });
    const md = String(rows?.[0]?.content_md || "").trim();
    if (!md) continue;
    parts.push(`${t}:\n\n${md}`);
  }
  return parts.length ? `Preference base pages:\n\n${parts.join("\n\n")}` : "";
}

async function loadThreadMessages(threadId, limit) {
  // Purpose: load recent chat messages for the thread (exclude internal tool bubbles).
  const query =
    `?select=created_at,content_md,kv_tags` +
    `&thread_id=eq.${encodeURIComponent(threadId)}` +
    `&order=created_at.desc` +
    `&limit=${encodeURIComponent(limit * 3)}`; // oversample, then filter out tool bubbles

  const rows = await supabaseRequest("pages", { query });
  const filtered = (rows || []).filter((r) => {
    const kv = r?.kv_tags || {};
    const role = kv?.role;
    if (role !== "assistant" && role !== "user") return false;
    const bubbleKind = typeof kv?.bubble_kind === "string" ? kv.bubble_kind.trim() : "";
    if (bubbleKind === "plan" || bubbleKind === "tool_call" || bubbleKind === "tool_result") return false;
    return true;
  });

  const ordered = filtered.slice(0, limit).reverse();
  return ordered.map((r) => ({
    role: r?.kv_tags?.role === "assistant" ? "model" : "user",
    text: String(r?.content_md || ""),
  }));
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

  // Bulk insert (PostgREST accepts an array body).
  const rows = await supabaseRequest("pages", {
    method: "POST",
    query: "?select=id,title",
    body: cleaned,
  });

  return rows || [];
}

async function saveChatBubble({
  threadId,
  content_md,
  kv_tags,
  tags = ["*chat"],
  title = null,
  allowSecrets = false,
  embed = true,
} = {}) {
  // Purpose: save a single chat bubble (page) with embeddings inline.
  const content = String(content_md || "");
  if (!content.trim()) throw new Error("Bubble content_md is required");
  assertNoSecrets(content, { allow: allowSecrets });
  if (title) assertNoSecrets(String(title), { allow: allowSecrets });

  const embedFields = embed ? (await makeEmbeddingFieldsBatch({ contents_md: [content] }))?.[0] : null;
  const rows = await supabaseRequest("pages", {
    method: "POST",
    query: "?select=id",
    body: {
      thread_id: threadId,
      title,
      content_md: content,
      tags,
      kv_tags: kv_tags && typeof kv_tags === "object" ? kv_tags : {},
      next_page_id: null,
      ...(embedFields || {}),
    },
  });
  return rows?.[0]?.id || null;
}

function agentProtocolText({ allowWebSearch } = {}) {
  // Purpose: enforce a stable agent protocol without adding new infra.
  return (
    "You are Enkidu, operating in AGENT mode.\n\n" +
    "You MUST respond with a single JSON object containing the key \"enkidu_agent\".\n" +
    "No prose outside that JSON.\n\n" +
    "Allowed response types:\n" +
    "- plan: {\"enkidu_agent\":{\"type\":\"plan\",\"text\":\"...\"}}\n" +
    "- tool_call: {\"enkidu_agent\":{\"type\":\"tool_call\",\"id\":\"...\",\"name\":\"...\",\"args\":{...},\"plan\":\"...\"}}\n" +
    "- final: {\"enkidu_agent\":{\"type\":\"final\",\"text\":\"...\"}}\n\n" +
    "Notes:\n" +
    "- Use tools only when needed. Prefer minimal steps.\n" +
    "- For writes (create/update/delete), be explicit and cautious.\n" +
    "- Base pages like *bio/*style/*strategy are already included in your system instruction.\n" +
    "- IMPORTANT: if you will call a tool, include your short plan in tool_call.plan (so we can do it in one round-trip).\n" +
    "- If you call a tool, wait for the tool result before proceeding.\n\n" +
    toolManifestShortText({ allowWebSearch })
  );
}

exports.handler = async (event, context) => {
  // Netlify dev (lambda-local) can hang until timeout if the event loop has open handles
  // (e.g., keep-alive sockets from fetch/undici). This matches AWS Lambda best practice.
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  // Netlify dev hard-times out at 30s; never let upstream fetches run longer than that.
  // (User may set ENKIDU_HTTP_TIMEOUT_MS higher; clamp it here for chat.)
  const existingTimeout = Number(process.env.ENKIDU_HTTP_TIMEOUT_MS || 20000);
  const clampedTimeout = Math.min(Number.isFinite(existingTimeout) ? existingTimeout : 20000, 25000);
  process.env.ENKIDU_HTTP_TIMEOUT_MS = String(clampedTimeout);

  const debugTimings = String(process.env.ENKIDU_DEBUG_TIMINGS || "").trim() === "1";
  function t0() {
    return Date.now();
  }
  function logTiming(name, startMs) {
    if (!debugTimings) return;
    const ms = Date.now() - startMs;
    console.error(`[enkidu] timing ${name}: ${ms}ms`);
  }
  const debugHandles = String(process.env.ENKIDU_DEBUG_HANDLES || "").trim() === "1";
  const debugPromptSizes = String(process.env.ENKIDU_DEBUG_PROMPT_SIZES || "").trim() === "1";
  if (debugHandles) {
    // Use unref() so the debug timer itself doesn't keep the event loop alive.
    const t1 = setTimeout(() => dumpActiveHandles("t+1s"), 1000);
    const t5 = setTimeout(() => dumpActiveHandles("t+5s"), 5000);
    if (typeof t1.unref === "function") t1.unref();
    if (typeof t5.unref === "function") t5.unref();
  }
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
    const isNewThread = !threadId;
    const model = body.model ? String(body.model) : null;
    const contextPageIds = body.context_page_ids || [];
    const useWebSearch = body.use_web_search === true;

    if (!message.trim()) return json(400, { error: "message is required" });
    assertNoSecrets(message, { allow: allowSecrets });

    if (!threadId) threadId = crypto.randomUUID();

    const tCtx = t0();
    const systemPrompt = await loadSystemPromptText();
    const prefsText = await loadPreferenceBasePagesText();
    const history = await loadThreadMessages(threadId, 12);
    logTiming("loadChatContext", tCtx);
    const contextPages = await loadContextPages(contextPageIds);

    // Pass selected context pages as a separate user message (keeps system prompt "pure").
    const extraMessages = [];
    if (contextPages.length) {
      const ctx = contextPages
        .map((p) => {
          const t = p.title ? `Title: ${p.title}\n` : "";
          return `---\n${t}${String(p.content_md || "")}`;
        })
        .join("\n\n");
      extraMessages.push({ role: "user", text: `Selected context pages:\n${ctx}` });
    }

    // Save user message as first bubble (embedding is deferred to /api/backfill-embeddings).
    const userRows = await supabaseRequest("pages", {
      method: "POST",
      query: "?select=id",
      body: {
        thread_id: threadId,
        title: null,
        content_md: message,
        tags: ["*chat"],
        kv_tags: { role: "user" },
        next_page_id: null,
      },
    });
    const userPageId = userRows?.[0]?.id || null;

    // -------------------------
    // Agent loop (plan -> tool_call* -> final)
    // -------------------------
    const agentSystem = [
      String(systemPrompt || "").trim(),
      String(prefsText || "").trim(),
      agentProtocolText({ allowWebSearch: useWebSearch }),
    ]
      .filter(Boolean)
      .join("\n\n");

    const messages = [...history, ...extraMessages, { role: "user", text: message }];

    if (debugPromptSizes) {
      const sysLen = agentSystem.length;
      const msgsLen = messages.reduce((sum, m) => sum + String(m?.text || "").length, 0);
      const approxTokens = Math.ceil((sysLen + msgsLen) / 4); // very rough
      console.error(
        `[enkidu] prompt_sizes sysChars=${sysLen} msgsChars=${msgsLen} msgs=${messages.length} approxTokens=${approxTokens}`
      );
    }
    const stepIds = [];
    let stepIndex = 0;
    let finalText = "";
    let finalMeta = null;
    let createdPages = [];

    // Keep this small to avoid Netlify dev lambda-local 30s timeouts.
    for (let iter = 0; iter < 4; iter++) {
      const tGem = t0();
      const raw = await geminiGenerate({ system: agentSystem, messages, model });
      logTiming("geminiGenerate", tGem);
      const { agent } = extractEnkiduAgentEnvelope(raw);

      // If the model didn't comply, treat as a final answer to avoid breaking the chat.
      if (!agent || typeof agent !== "object") {
        finalText = String(raw || "");
        break;
      }

      const type = String(agent.type || "").trim();

      if (type === "plan") {
        const text = String(agent.text || "").trim();
        if (!text) throw new Error("Agent plan.text is required");
        const id = await saveChatBubble({
          threadId,
          title: null,
          content_md: text,
          tags: ["*chat"],
          kv_tags: { role: "assistant", bubble_kind: "plan", step_index: stepIndex },
          allowSecrets,
          embed: false, // keep fast; embeddings not useful for plan bubbles
        });
        if (id) stepIds.push(id);
        messages.push({ role: "model", text });
        stepIndex++;
        continue;
      }

      if (type === "tool_call") {
        const toolCallId = String(agent.id || crypto.randomUUID());
        const name = String(agent.name || "").trim();
        const args = agent.args && typeof agent.args === "object" && !Array.isArray(agent.args) ? agent.args : {};
        if (!name) throw new Error("Agent tool_call.name is required");

        // Optional: allow the model to include a plan alongside the tool call (saves one extra Gemini call).
        const planText = typeof agent.plan === "string" ? agent.plan.trim() : "";
        if (planText) {
          const planPageId = await saveChatBubble({
            threadId,
            title: null,
            content_md: planText,
            tags: ["*chat"],
            kv_tags: { role: "assistant", bubble_kind: "plan", step_index: stepIndex },
            allowSecrets,
            embed: false,
          });
          if (planPageId) stepIds.push(planPageId);
          messages.push({ role: "model", text: planText });
          stepIndex++;
        }

        const callText =
          `Tool call: ${name}\n\n` +
          "Args:\n" +
          "```json\n" +
          JSON.stringify(args, null, 2) +
          "\n```";

        const callPageId = await saveChatBubble({
          threadId,
          title: null,
          content_md: callText,
          tags: ["*chat"],
          kv_tags: {
            role: "assistant",
            bubble_kind: "tool_call",
            tool_name: name,
            tool_call_id: toolCallId,
            step_index: stepIndex,
          },
          allowSecrets,
          embed: false, // keep fast; embeddings not useful for tool_call bubbles
        });
        if (callPageId) stepIds.push(callPageId);
        messages.push({ role: "model", text: callText });
        stepIndex++;

        let result;
        let ok = true;
        try {
          result = await executeTool(name, args, { allowSecrets, allowWebSearch: useWebSearch });
        } catch (e) {
          ok = false;
          result = { error: String(e?.message || e) };
        }

        const resultText =
          `Tool result: ${name} (${ok ? "ok" : "error"})\n\n` +
          "```json\n" +
          JSON.stringify(result, null, 2) +
          "\n```";

        const resultPageId = await saveChatBubble({
          threadId,
          title: null,
          content_md: resultText,
          tags: ["*chat"],
          kv_tags: {
            role: "assistant",
            bubble_kind: "tool_result",
            tool_name: name,
            tool_call_id: toolCallId,
            step_index: stepIndex,
          },
          allowSecrets,
          embed: false, // keep fast; embeddings not useful for tool_result bubbles
        });
        if (resultPageId) stepIds.push(resultPageId);
        messages.push({ role: "user", text: resultText });
        stepIndex++;

        // IMPORTANT (netlify dev 30s timeout): for write tools, don't require an extra model call.
        // We already did the work and persisted the call+result bubbles; return a short final message.
        if (ok && ["create_page", "update_page", "delete_page"].includes(name)) {
          const id = result?.page?.id || (typeof args?.id === "string" ? args.id : "");
          const shortId = id && typeof id === "string" ? id : "";
          finalText = shortId ? `Done. (${name}: ${shortId})` : `Done. (${name})`;
          break;
        }
        continue;
      }

      if (type === "final") {
        finalText = String(agent.text || "");
        break;
      }

      throw new Error(`Unknown agent.type: ${type}`);
    }

    // Apply existing enkidu_meta footer behavior to final text (optional).
    // Defensive: sometimes the model returns the JSON agent envelope but our loop falls back to raw text.
    // If so, re-parse here so we don't save a giant JSON blob to the chat UI.
    const reparsed = extractEnkiduAgentEnvelope(finalText);
    if (reparsed?.agent && typeof reparsed.agent === "object") {
      const t = String(reparsed.agent.type || "").trim();
      if (t === "final" && typeof reparsed.agent.text === "string") {
        finalText = reparsed.agent.text;
      }
    }

    const { cleaned: cleanedFinal, meta } = extractEnkiduMeta(finalText);
    finalMeta = meta || null;
    // Defensive: if the model returns an empty string (or only a JSON footer), don't crash the request.
    let reply = String(cleanedFinal || "");
    if (!reply.trim()) reply = "(empty reply)";

    // Optional: split into additional pages silently via meta.new_pages.
    createdPages = finalMeta ? await createPagesFromMeta(finalMeta, { allowSecrets }) : [];

    // Save final assistant bubble (with existing suggested_* behavior if present).
    assertNoSecrets(reply, { allow: allowSecrets });
    const suggestedTagsRaw = Array.isArray(finalMeta?.suggested_tags) ? finalMeta.suggested_tags : [];
    // Kind tags: keep chat bubbles as kind=*chat (avoid mixing kinds on a chat message).
    const suggestedTags = suggestedTagsRaw.filter((t) => !KIND_TAGS.has(String(t).trim()));
    const suggestedTitle =
      typeof finalMeta?.suggested_title === "string" && finalMeta.suggested_title.trim()
        ? finalMeta.suggested_title.trim()
        : null;
    const suggestedThreadTitle =
      typeof finalMeta?.suggested_thread_title === "string" ? finalMeta.suggested_thread_title.trim() : "";
    const fallbackThreadTitle = isNewThread
      ? String(message || "")
          .trim()
          .split(/\r?\n/g)[0]
          .replace(/\s+/g, " ")
          .slice(0, 80)
      : "";
    const suggestedKv =
      finalMeta?.suggested_kv_tags && typeof finalMeta.suggested_kv_tags === "object" ? finalMeta.suggested_kv_tags : {};

    const assistantTags = uniqueStrings(["*chat", ...suggestedTags]);
    const assistantKv = {
      ...suggestedKv,
      role: "assistant",
      bubble_kind: "final",
      step_index: stepIndex,
      ...(suggestedThreadTitle ? { thread_title: suggestedThreadTitle } : fallbackThreadTitle ? { thread_title: fallbackThreadTitle } : {}),
    };

    const assistantPageId = await saveChatBubble({
      threadId,
      title: suggestedTitle,
      content_md: reply,
      tags: assistantTags,
      kv_tags: assistantKv,
      allowSecrets,
      embed: false, // defer embedding to /api/backfill-embeddings
    });

    // Embeddings backfill: include any pages we created/updated without embeddings.
    const createdPageIds = Array.from(
      new Set(
        []
          .concat(createdPages.map((p) => p.id))
          .concat(userPageId ? [userPageId] : [])
          .concat(assistantPageId ? [assistantPageId] : [])
          .concat(stepIds || [])
      )
    );

    return json(200, {
      thread_id: threadId,
      reply,
      meta: finalMeta,
      created_pages: createdPageIds,
      saved: { userPageId, assistantPageId, agentStepIds: stepIds },
    });
  } catch (err) {
    const msg = String(err?.message || err);
    const status = err?.code === "ENKIDU_SECRET_DETECTED" ? 400 : 500;
    return json(status, { error: msg });
  }
};


