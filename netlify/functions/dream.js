// POST /api/dream
// Purpose: manual "dream" run (user clicks). Small batch cleanup: add title/tags/kv_tags.
// Writes a dream diary page summarizing what changed.

const { requireAdmin } = require("./_auth");
const { supabaseRequest } = require("./_supabase");
const { geminiGenerate } = require("./_gemini");
const { assertNoSecrets, isAllowSecrets } = require("./_secrets");
const { makeEmbeddingFields } = require("./_embeddings");
const { toolManifestShortText, executeTool } = require("./_agent_tools");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
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
  // Purpose: load the most recent preference base pages (kept small).
  const tags = ["*style", "*bio", "*strategy", "*habits", "*preference", "*lesson"];
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

function extractEnkiduAgentEnvelope(text) {
  // Purpose: parse the agent envelope emitted by the model for tool use.
  //
  // Expected shapes (preferably the entire response):
  // - {"enkidu_agent":{"type":"tool_call","id":"...","name":"search_pages","args":{...}, "plan":"..."}}
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

function agentProtocolText() {
  // Purpose: enforce a stable agent protocol without adding new infra.
  return (
    "You are Enkidu, operating in AGENT mode.\n\n" +
    'You MUST respond with a single JSON object containing the key "enkidu_agent".\n' +
    "No prose outside that JSON.\n\n" +
    "Allowed response types:\n" +
    '- tool_call: {"enkidu_agent":{"type":"tool_call","id":"...","name":"...","args":{...},"plan":"..."}}\n' +
    '- final: {"enkidu_agent":{"type":"final","text":"..."}}\n\n' +
    'IMPORTANT: Do NOT respond with type "plan". If you need a plan, put it in tool_call.plan.\n' +
    "(Goal: minimize the number of generateContent calls.)\n\n" +
    "Notes:\n" +
    "- Use tools only when needed. Prefer minimal steps.\n" +
    "- For writes (create/update/delete), be explicit and cautious.\n" +
    "- IMPORTANT: avoid search_pages loops. Do NOT call search_pages more than once per Dream run.\n" +
    "  Start from the provided Seed page ids; use get_page(id) to read, then update_page(id, patch) to improve.\n" +
    "- You should try to make at least ONE meaningful write (update_page/create_page/delete_page).\n" +
    '  If you make zero writes, your final diary MUST explain why (e.g. "no safe changes found").\n' +
    "- If you will call a tool, include your short plan in tool_call.plan.\n" +
    "- If you call a tool, wait for the tool result before proceeding.\n\n" +
    toolManifestShortText({ allowWebSearch: false })
  );
}

function truncateText(s, maxChars) {
  const text = String(s ?? "");
  const n = Number(maxChars);
  const max = Number.isFinite(n) && n > 0 ? Math.floor(n) : 2000;
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n...(truncated, ${text.length} chars total)`;
}

function compactToolResult(toolName, result) {
  // Purpose: keep Gemini input tokens bounded (tool results can be huge).
  const name = String(toolName || "");
  const maxChars = 2000;

  function compactPage(p) {
    if (!p || typeof p !== "object") return p;
    const content = typeof p.content_md === "string" ? p.content_md : "";
    const out = {
      id: p.id ?? null,
      created_at: p.created_at ?? null,
      updated_at: p.updated_at ?? null,
      thread_id: p.thread_id ?? null,
      next_page_id: p.next_page_id ?? null,
      title: p.title ?? null,
      tags: p.tags ?? null,
      kv_tags: p.kv_tags ?? null,
      ...(p.distance != null ? { distance: p.distance } : {}),
    };
    if (content) {
      out.content_md_preview = truncateText(content, maxChars);
      out.content_md_chars = content.length;
    }
    return out;
  }

  if (!result || typeof result !== "object") return result;
  if (Array.isArray(result.pages)) return { ...result, pages: result.pages.map(compactPage) };
  if (result.page && typeof result.page === "object") return { ...result, page: compactPage(result.page) };
  if (result.source_page && typeof result.source_page === "object" && Array.isArray(result.pages)) {
    return {
      ...result,
      source_page: { id: result.source_page.id ?? null, title: result.source_page.title ?? null },
      pages: result.pages.map(compactPage),
    };
  }
  const out = { ...result, tool: name };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && v.length > maxChars * 2) out[k] = truncateText(v, maxChars);
  }
  return out;
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
      return json(200, { updated: 0, diaryPageId: null, candidates: 0, proposed: 0, message: "No candidates." });
    }

    const model = body.model ? String(body.model) : null;
    const systemPrompt = await loadSystemPromptText();
    const prefsText = await loadPreferenceBasePagesText();
    const agentSystem = [String(systemPrompt || "").trim(), String(prefsText || "").trim(), agentProtocolText(), `Dream instructions:\n\n${dreamPrompt}`]
      .filter(Boolean)
      .join("\n\n");

    const seedPagesText = candidates
      .map((p, i) => {
        const title = p.title ? `title=${p.title}\n` : "";
        const tags = Array.isArray(p.tags) && p.tags.length ? `tags=${JSON.stringify(p.tags)}\n` : "";
        const created = p.created_at ? `created_at=${p.created_at}\n` : "";
        const content = truncateText(String(p.content_md || ""), 2000);
        return `#${i + 1} id=${p.id}\n${title}${tags}${created}content:\n${content}\n`;
      })
      .join("\n");

    const messages = [
      {
        role: "user",
        text:
          "Seed pages (recent, but you may wander anywhere):\n\n" +
          seedPagesText +
          "\n\nStart from these ids. Pick ONE seed page, read it with get_page, then do at least one concrete improvement via update_page (or delete_page if truly redundant). Avoid repeated search_pages.",
      },
    ];

    let finalText = "";
    let proposed = 0;
    const updatedIds = new Set();
    const deletedIds = new Set();
    const createdIds = new Set();
    const visitedIds = new Set(candidates.map((p) => String(p.id)));
    const toolCalls = []; // { name, ok, error? } (for diary/debugging)

    // Keep it small: background dreaming should be cheap.
    for (let iter = 0; iter < 8; iter++) {
      const raw = await geminiGenerate({ system: agentSystem, messages, model });
      const { agent } = extractEnkiduAgentEnvelope(raw);

      // If the model didn't comply, stop and record the raw text (helps you debug prompt issues).
      if (!agent || typeof agent !== "object") {
        finalText = String(raw || "");
        break;
      }

      const type = String(agent.type || "").trim();

      if (type === "tool_call") {
        proposed++;
        const name = String(agent.name || "").trim();
        const args = agent.args && typeof agent.args === "object" && !Array.isArray(agent.args) ? agent.args : {};
        if (!name) throw new Error("Agent tool_call.name is required");

        let result;
        let ok = true;
        try {
          result = await executeTool(name, args, { allowSecrets, allowWebSearch: false });
        } catch (e) {
          ok = false;
          result = { error: String(e?.message || e) };
        }
        toolCalls.push({ name, ok, ...(ok ? {} : { error: String(result?.error || "") }) });

        // Track ids changed (best effort; keeps diary useful).
        if (ok) {
          if (name === "update_page" && result?.page?.id) updatedIds.add(String(result.page.id));
          if (name === "delete_page" && typeof args?.id === "string") deletedIds.add(String(args.id));
          if (name === "create_page" && result?.page?.id) createdIds.add(String(result.page.id));
          // Wander bookkeeping
          if (name === "get_page" && result?.page?.id) visitedIds.add(String(result.page.id));
          if (name === "related_to_page" && args?.id) visitedIds.add(String(args.id));
          if (name === "search_pages" && Array.isArray(result?.pages)) {
            for (const p of result.pages.slice(0, 25)) if (p?.id) visitedIds.add(String(p.id));
          }
          if ((name === "related_pages" || name === "related_to_page") && Array.isArray(result?.pages)) {
            for (const p of result.pages.slice(0, 25)) if (p?.id) visitedIds.add(String(p.id));
          }
        }

        const compact = compactToolResult(name, result);
        const resultText =
          `Tool result: ${name} (${ok ? "ok" : "error"})\n\n` + "```json\n" + JSON.stringify(compact, null, 2) + "\n```";
        messages.push({ role: "user", text: resultText });
        continue;
      }

      if (type === "final") {
        finalText = String(agent.text || "").trim();
        break;
      }

      throw new Error(`Unknown agent.type: ${type}`);
    }

    const updated = updatedIds.size; // For backwards-compatible UI messaging (counts update_page calls).

    const diaryTitle = `Dream diary (${new Date().toLocaleString()})`;
    const toolCallsSummary = toolCalls.length
      ? `Tool calls (${toolCalls.length}):\n` +
        toolCalls
          .slice(0, 50)
          .map((t) => `- ${t.name} (${t.ok ? "ok" : "error"})${t.ok ? "" : t.error ? `: ${t.error}` : ""}`)
          .join("\n") +
        (toolCalls.length > 50 ? "\n- ...(truncated)" : "")
      : "Tool calls: (none)";
    const diaryContent =
      (finalText ? `${finalText}\n\n` : "") +
      `Seed candidates: ${candidates.length}\n` +
      `Tool calls: ${proposed}\n` +
      `${toolCallsSummary}\n\n` +
      `Updated pages (${updatedIds.size}):\n` +
      Array.from(updatedIds).map((id) => `- ${id}`).join("\n") +
      `\n\nDeleted pages (${deletedIds.size}):\n` +
      (deletedIds.size ? Array.from(deletedIds).map((id) => `- ${id}`).join("\n") : "(none)") +
      `\n\nCreated pages (${createdIds.size}):\n` +
      (createdIds.size ? Array.from(createdIds).map((id) => `- ${id}`).join("\n") : "(none)") +
      `\n\nVisited pages (sample up to 40):\n` +
      Array.from(visitedIds).slice(0, 40).map((id) => `- ${id}`).join("\n");

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
      proposed,
      actions: {
        updated_page_ids: Array.from(updatedIds),
        deleted_page_ids: Array.from(deletedIds),
        created_page_ids: Array.from(createdIds),
      },
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};


