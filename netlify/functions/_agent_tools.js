// Agent tools (allowlisted).
// Purpose: give the chat agent explicit capabilities without exposing raw HTTP or raw SQL writes.
//
// IMPORTANT:
// - Tool execution happens server-side; the model only requests tool calls.
// - We keep this dependency-light (Supabase via PostgREST).

const { supabaseRequest } = require("./_supabase");
const { assertNoSecrets } = require("./_secrets");
const { makeEmbeddingFields } = require("./_embeddings");
const { geminiGenerate } = require("./_gemini");

// Optional dependency: only needed for sql_select. Keep normal chat working without it.
let Pool = null;
try {
  // eslint-disable-next-line global-require
  ({ Pool } = require("pg"));
} catch {
  Pool = null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pgPool = null;
function getPgPool() {
  // Purpose: SELECT-only SQL fallback when PostgREST filters aren't enough.
  if (!Pool) throw new Error('sql_select requires npm dependency "pg" (run npm install)');
  const url = process.env.SUPABASE_DB_URL || process.env.ENKIDU_DB_URL || "";
  if (!url) throw new Error("Missing SUPABASE_DB_URL (or ENKIDU_DB_URL)");
  if (!pgPool) pgPool = new Pool({ connectionString: url, max: 1 });
  return pgPool;
}

function clampLimit(raw, { min = 1, max = 200, fallback = 50 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeUuid(id) {
  const s = String(id || "").trim();
  if (!UUID_RE.test(s)) throw new Error("Invalid id (must be UUID)");
  return s;
}

function safeString(v, { maxLen = 20000 } = {}) {
  const s = String(v ?? "");
  if (s.length > maxLen) throw new Error(`String too long (max ${maxLen})`);
  return s;
}

function safeTags(tags) {
  const arr = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (arr.length > 50) throw new Error("Too many tags (max 50)");
  return arr;
}

function safeKvTags(kv) {
  if (kv == null) return {};
  if (!kv || typeof kv !== "object" || Array.isArray(kv)) throw new Error("kv_tags must be an object");
  const out = {};
  for (const [k, v] of Object.entries(kv)) {
    const key = String(k).trim();
    if (!key) continue;
    out[key] = v;
  }
  return out;
}

function toolManifest({ allowWebSearch } = {}) {
  const tools = [
    {
      name: "search_pages",
      description: "List/search pages (substring search + simple filters).",
      args_schema: {
        type: "object",
        properties: {
          q: { type: "string" },
          tag: { type: "string" },
          thread_id: { type: "string" },
          kv_key: { type: "string" },
          kv_value: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "related_pages",
      description: "Semantic vector search over pages (pgvector) given a query string.",
      args_schema: {
        type: "object",
        properties: { query_text: { type: "string" }, limit: { type: "number" } },
        required: ["query_text"],
      },
    },
    {
      name: "related_to_page",
      description: "Semantic vector search for pages similar to a page id.",
      args_schema: { type: "object", properties: { id: { type: "string" }, limit: { type: "number" } }, required: ["id"] },
    },
    {
      name: "related_to_most_recent_page",
      description: "Find the most recent page (optional filters) and return semantically similar pages.",
      args_schema: {
        type: "object",
        properties: { limit: { type: "number" }, tag: { type: "string" }, kv_key: { type: "string" }, kv_value: { type: "string" } },
      },
    },
    { name: "get_page", description: "Fetch a single page by id.", args_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    {
      name: "create_page",
      description: "Create a page (DB write).",
      args_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          content_md: { type: "string" },
          tags: { type: "array" },
          kv_tags: { type: "object" },
          thread_id: { type: "string" },
          next_page_id: { type: "string" },
        },
        required: ["content_md"],
      },
    },
    {
      name: "update_page",
      description: "Update a page by id (DB write).",
      args_schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          patch: {
            type: "object",
            properties: {
              title: { type: "string" },
              content_md: { type: "string" },
              tags: { type: "array" },
              kv_tags: { type: "object" },
              thread_id: { type: "string" },
              next_page_id: { type: "string" },
            },
          },
        },
        required: ["id", "patch"],
      },
    },
    { name: "delete_page", description: "Delete a page by id (DB write).", args_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    {
      name: "sql_select",
      description: "Fallback: run a read-only SQL query (SELECT/CTE only). No UPDATE/DELETE/INSERT.",
      args_schema: { type: "object", properties: { sql: { type: "string" }, max_rows: { type: "number" } }, required: ["sql"] },
    },
  ];

  if (allowWebSearch) {
    tools.push({
      name: "web_search",
      description: "Run a web search via Gemini google_search grounding and return a concise markdown answer.",
      args_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    });
  }

  return tools;
}

function toolManifestText({ allowWebSearch } = {}) {
  return (
    "Available tools (JSON):\n" +
    JSON.stringify(
      {
        tools: toolManifest({ allowWebSearch }),
        notes: ["Use tools only when needed; otherwise answer directly.", "For write tools, be explicit about intended changes."],
      },
      null,
      2
    )
  );
}

function toolManifestShortText({ allowWebSearch } = {}) {
  // Purpose: a compact tool list to keep prompts small (avoid token/min quota spikes).
  const tools = toolManifest({ allowWebSearch });
  const lines = [];
  lines.push("Available tools:");
  for (const t of tools) {
    const name = String(t?.name || "").trim();
    const desc = String(t?.description || "").trim();
    if (!name) continue;
    lines.push(`- ${name}: ${desc}`);
  }
  lines.push("");
  lines.push("Tool calling rules:");
  lines.push("- Call at most one tool at a time, then wait for its result.");
  lines.push("- Keep args small and only include needed fields.");
  return lines.join("\n");
}

async function executeTool(name, args, { allowSecrets, allowWebSearch } = {}) {
  const toolName = String(name || "").trim();
  const a = args && typeof args === "object" && !Array.isArray(args) ? args : {};

  if (toolName === "search_pages") {
    const limit = clampLimit(a.limit, { max: 2000, fallback: 50 });
    const tag = a.tag != null ? String(a.tag).trim() : "";
    const threadId = a.thread_id != null ? String(a.thread_id).trim() : "";
    const q = a.q != null ? String(a.q).trim() : "";
    const kvKey = a.kv_key != null ? String(a.kv_key).trim() : "";
    const kvValue = a.kv_value != null ? String(a.kv_value).trim() : "";
    if ((kvKey && !kvValue) || (!kvKey && kvValue)) throw new Error("kv_key and kv_value must be provided together");

    const filters = [];
    if (tag) filters.push(`tags=cs.{${encodeURIComponent(tag)}}`);
    if (threadId) filters.push(`thread_id=eq.${encodeURIComponent(threadId)}`);
    if (q) filters.push(`content_md=ilike.*${encodeURIComponent(q)}*`);
    if (kvKey && kvValue) {
      const obj = { [kvKey]: kvValue };
      filters.push(`kv_tags=cs.${encodeURIComponent(JSON.stringify(obj))}`);
    }
    const query =
      `?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md` +
      `&order=created_at.desc` +
      `&limit=${encodeURIComponent(limit)}` +
      (filters.length ? `&${filters.join("&")}` : "");

    const rows = await supabaseRequest("pages", { query });
    return { pages: rows || [] };
  }

  if (toolName === "related_pages") {
    const queryText = safeString(a.query_text, { maxLen: 20000 }).trim();
    if (!queryText) throw new Error("query_text is required");
    const limit = clampLimit(a.limit, { max: 200, fallback: 25 });

    const embed = await makeEmbeddingFields({ content_md: queryText, taskType: "RETRIEVAL_QUERY" });
    if (!embed?.embedding) throw new Error("Failed to embed query_text");
    const rows = await supabaseRequest("rpc/match_pages", { method: "POST", body: { query_embedding: embed.embedding, match_count: limit } });
    return { pages: rows || [] };
  }

  if (toolName === "related_to_page") {
    const id = safeUuid(a.id);
    const limit = clampLimit(a.limit, { max: 200, fallback: 25 });

    const rows = await supabaseRequest("pages", { query: `?select=id,title,content_md,embedding&limit=1&id=eq.${encodeURIComponent(id)}` });
    const page = rows?.[0] || null;
    if (!page) throw new Error("Page not found");

    let queryEmbedding = Array.isArray(page.embedding) && page.embedding.length ? page.embedding : null;
    if (!queryEmbedding) {
      const queryText = String(page.content_md || "").trim();
      if (!queryText) throw new Error("Source page has empty content_md");
      const embed = await makeEmbeddingFields({ content_md: queryText, taskType: "RETRIEVAL_QUERY" });
      if (!embed?.embedding) throw new Error("Failed to embed source page");
      queryEmbedding = embed.embedding;
    }

    const hits = await supabaseRequest("rpc/match_pages", { method: "POST", body: { query_embedding: queryEmbedding, match_count: limit + 1 } });
    const pages = (hits || []).filter((p) => String(p?.id || "") !== id).slice(0, limit);
    return { source_page: { id: page.id, title: page.title || null }, pages };
  }

  if (toolName === "related_to_most_recent_page") {
    const limit = clampLimit(a.limit, { max: 200, fallback: 5 });
    const tag = a.tag != null ? String(a.tag).trim() : "";
    const kvKey = a.kv_key != null ? String(a.kv_key).trim() : "";
    const kvValue = a.kv_value != null ? String(a.kv_value).trim() : "";
    if ((kvKey && !kvValue) || (!kvKey && kvValue)) throw new Error("kv_key and kv_value must be provided together");

    const filters = [];
    if (tag) filters.push(`tags=cs.{${encodeURIComponent(tag)}}`);
    if (kvKey && kvValue) {
      const obj = { [kvKey]: kvValue };
      filters.push(`kv_tags=cs.${encodeURIComponent(JSON.stringify(obj))}`);
    }

    const query =
      `?select=id,title,created_at` +
      `&order=created_at.desc` +
      `&limit=1` +
      (filters.length ? `&${filters.join("&")}` : "");

    const rows = await supabaseRequest("pages", { query });
    const page = rows?.[0] || null;
    if (!page?.id) throw new Error("No pages found");
    const rel = await executeTool("related_to_page", { id: page.id, limit }, { allowSecrets, allowWebSearch });
    return { most_recent_page: page, ...rel };
  }

  if (toolName === "get_page") {
    const id = safeUuid(a.id);
    const rows = await supabaseRequest("pages", {
      query:
        `?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md` +
        `&id=eq.${encodeURIComponent(id)}` +
        `&limit=1`,
    });
    return { page: rows?.[0] || null };
  }

  if (toolName === "create_page") {
    const title = a.title != null ? safeString(a.title, { maxLen: 300 }).trim() : null;
    const content_md = safeString(a.content_md, { maxLen: 200000 });
    if (!String(content_md || "").trim()) throw new Error("content_md is required");
    const tags = safeTags(a.tags);
    const kv_tags = safeKvTags(a.kv_tags);
    const thread_id = a.thread_id != null ? String(a.thread_id).trim() || null : null;
    const next_page_id = a.next_page_id != null ? String(a.next_page_id).trim() || null : null;
    if (next_page_id) safeUuid(next_page_id);

    if (title) assertNoSecrets(title, { allow: allowSecrets });
    assertNoSecrets(content_md, { allow: allowSecrets });

    const body = {
      title: title || null,
      content_md,
      tags,
      kv_tags,
      thread_id,
      next_page_id,
      // Embedding deferred (filled by /api/backfill-embeddings).
      embedding: null,
      embedding_model: null,
      embedding_updated_at: null,
    };

    const rows = await supabaseRequest("pages", {
      method: "POST",
      query: "?select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md",
      body,
    });
    return { page: rows?.[0] || null };
  }

  if (toolName === "update_page") {
    const id = safeUuid(a.id);
    const patchIn = a.patch && typeof a.patch === "object" && !Array.isArray(a.patch) ? a.patch : null;
    if (!patchIn) throw new Error("patch is required");

    const patch = {};
    if (patchIn.title !== undefined) patch.title = patchIn.title ?? null;
    if (patchIn.content_md !== undefined) patch.content_md = safeString(patchIn.content_md, { maxLen: 200000 });
    if (patchIn.tags !== undefined) patch.tags = safeTags(patchIn.tags);
    if (patchIn.kv_tags !== undefined) patch.kv_tags = safeKvTags(patchIn.kv_tags);
    if (patchIn.thread_id !== undefined) patch.thread_id = patchIn.thread_id ?? null;
    if (patchIn.next_page_id !== undefined) patch.next_page_id = patchIn.next_page_id ?? null;

    if (patch.title != null) {
      const t = safeString(patch.title, { maxLen: 300 }).trim();
      patch.title = t || null;
      if (patch.title) assertNoSecrets(patch.title, { allow: allowSecrets });
    }
    if (patch.next_page_id) safeUuid(patch.next_page_id);

    if (patch.content_md !== undefined) {
      if (!String(patch.content_md || "").trim()) throw new Error("content_md cannot be blank");
      assertNoSecrets(patch.content_md, { allow: allowSecrets });
      // Embedding deferred (filled by /api/backfill-embeddings).
      patch.embedding = null;
      patch.embedding_model = null;
      patch.embedding_updated_at = null;
    }

    const rows = await supabaseRequest("pages", {
      method: "PATCH",
      query:
        `?id=eq.${encodeURIComponent(id)}` +
        `&select=id,created_at,updated_at,thread_id,next_page_id,title,tags,kv_tags,content_md`,
      body: patch,
    });
    return { page: rows?.[0] || null };
  }

  if (toolName === "delete_page") {
    const id = safeUuid(a.id);
    await supabaseRequest("pages", { method: "DELETE", query: `?id=eq.${encodeURIComponent(id)}` });
    return { ok: true };
  }

  if (toolName === "sql_select") {
    const sqlRaw = safeString(a.sql, { maxLen: 40000 });
    let sql = String(sqlRaw || "").trim().replace(/;+\s*$/, "");
    if (!sql) throw new Error("sql is required");

    if (!/^(with\b|select\b)/i.test(sql)) throw new Error("Only SELECT/CTE queries are allowed");
    const lowered = sql.toLowerCase();
    const blocked = ["update", "delete", "insert", "alter", "drop", "create", "truncate", "grant", "revoke", "vacuum"];
    for (const w of blocked) {
      if (lowered.includes(w + " ")) throw new Error(`Blocked keyword in sql: ${w}`);
    }
    if (lowered.includes(" for update") || lowered.includes(" for share")) {
      throw new Error("FOR UPDATE/SHARE is not allowed");
    }

    const maxRows = clampLimit(a.max_rows, { min: 1, max: 500, fallback: 200 });
    const wrapped = `SELECT * FROM (${sql}) AS enkidu_q LIMIT $1`;

    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '8000ms'");
      const res = await client.query(wrapped, [maxRows]);
      await client.query("ROLLBACK");
      return {
        columns: res.fields?.map((f) => f.name) || [],
        row_count: res.rowCount || 0,
        rows: res.rows || [],
        truncated: (res.rowCount || 0) >= maxRows,
      };
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  if (toolName === "web_search") {
    if (!allowWebSearch) throw new Error("web_search is disabled");
    const query = safeString(a.query, { maxLen: 400 }).trim();
    if (!query) throw new Error("query is required");

    const text = await geminiGenerate({
      system:
        "You are a web search tool. Use google_search grounding. Return a concise markdown answer with citations where possible.",
      messages: [{ role: "user", text: query }],
      tools: [{ google_search: {} }],
    });
    return { answer_md: String(text || "") };
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

module.exports = { toolManifestText, toolManifestShortText, executeTool };
