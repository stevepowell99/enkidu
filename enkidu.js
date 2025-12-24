#!/usr/bin/env node
/**
 * Enkidu (Node.js) - local-first file-based assistant.
 *
 * Keep it small:
 * - One file for CLI + tiny HTTP server UI
 * - Instructions are "soft": editable markdown files under ./instructions/
 * - Memories are the source of truth: ./memories/
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo locations (all relative to this file)
const REPO_ROOT = __dirname;
const MEMORIES_DIR = path.join(REPO_ROOT, "memories");
const INDEX_FILE = path.join(MEMORIES_DIR, "_index.json");
const EMBEDDINGS_FILE = path.join(MEMORIES_DIR, "_embeddings.json");
const SOURCE_EMBEDDINGS_FILE = path.join(MEMORIES_DIR, "_source_embeddings.json");
const SOURCES_DIR = path.join(MEMORIES_DIR, "sources");
const SOURCES_VERBATIM_DIR = path.join(SOURCES_DIR, "verbatim");
const SESSIONS_DIR = path.join(MEMORIES_DIR, "sessions");
const SESSION_LOG_FILE = path.join(SESSIONS_DIR, "recent.jsonl");
const INSTRUCTIONS_DIR = path.join(REPO_ROOT, "instructions");
const WORK_INSTRUCTION_FILE = path.join(INSTRUCTIONS_DIR, "work.md");
const DREAM_INSTRUCTION_FILE = path.join(INSTRUCTIONS_DIR, "dream.md");
const SOURCES_INSTRUCTION_FILE = path.join(INSTRUCTIONS_DIR, "sources.md");
const DOTENV_FILE = path.join(REPO_ROOT, ".env");
const PUBLIC_INDEX_FILE = path.join(REPO_ROOT, "public", "index.html");

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_PORT = 3000;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const IMPORTANCE_WEIGHT_EMBED = 0.1; // adds up to +0.3 for importance=3
const IMPORTANCE_WEIGHT_KEYWORD = 2; // adds up to +6 for importance=3

const MEMORY_FOLDERS = [
  path.join(MEMORIES_DIR, "inbox"),
  path.join(MEMORIES_DIR, "people"),
  path.join(MEMORIES_DIR, "projects"),
  path.join(MEMORIES_DIR, "howto"),
  path.join(MEMORIES_DIR, "diary"),
];

// -----------------------------
// Storage mode (local filesystem vs Supabase SQL)
// -----------------------------
function getStorageMode() {
  // Read .env lazily (no deps) so local dev can set ENKIDU_STORAGE there.
  loadDotenvIfPresent();
  return String(process.env.ENKIDU_STORAGE || "local").toLowerCase().trim() || "local";
}

function isSupabaseMode() {
  return getStorageMode() === "supabase";
}

function assertSafeMemoriesRelPath(rel) {
  // Purpose: validate "memories/..." paths coming from DB or API (no filesystem assumptions).
  const p = String(rel || "").replaceAll("\\", "/").trim();
  if (!p.startsWith("memories/")) throw new Error(`Path must start with memories/: ${p}`);
  const parts = p.split("/").filter(Boolean);
  if (parts.some((x) => x === "." || x === "..")) throw new Error(`Invalid path segment: ${p}`);
  if (parts.some((x) => x.includes("\u0000"))) throw new Error(`Invalid path: ${p}`);
  return p;
}

function getSupabaseConfig() {
  loadDotenvIfPresent();
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url) throw new Error("Missing SUPABASE_URL (required for ENKIDU_STORAGE=supabase)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (required for ENKIDU_STORAGE=supabase)");
  return { url, key };
}

async function supabaseRest(table, { method = "GET", query = {}, body = null } = {}) {
  // Minimal Supabase PostgREST client (no deps).
  const { url, key } = getSupabaseConfig();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const full = `${url}/rest/v1/${table}${qs.toString() ? "?" + qs.toString() : ""}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  if (body !== null) headers["Content-Type"] = "application/json";

  const resp = await fetch(full, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Supabase HTTP ${resp.status}: ${text}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function sbInsertSessionEvent(role, content, meta = {}) {
  await supabaseRest("session_events", {
    method: "POST",
    query: { select: "id" },
    body: [{ role: String(role || ""), content: String(content || ""), meta: meta || {} }],
  });
}

async function sbLoadRecentSessionEvents(maxN = 30) {
  const rows = await supabaseRest("session_events", {
    method: "GET",
    query: { select: "role,content,created_at", order: "created_at.desc", limit: String(Math.max(1, Number(maxN) || 30)) },
  });
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const role = String(r?.role || "");
    const content = String(r?.content || "");
    if ((role === "user" || role === "assistant") && content.trim()) out.push({ role, content, ts: r?.created_at });
  }
  out.reverse(); // oldest->newest
  return out;
}

async function sbUpsertMemoryRow({ path: relPath, content, title, tags, importance }) {
  const p = assertSafeMemoriesRelPath(relPath);
  const row = {
    path: p,
    title: title === undefined ? null : String(title || ""),
    tags: Array.isArray(tags) ? tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
    content: String(content || ""),
    importance: Number.isFinite(Number(importance)) ? Number(importance) : 0,
    updated_at: nowIso(),
  };
  await supabaseRest("memories", { method: "POST", query: { on_conflict: "path", select: "id" }, body: [row] });
}

async function sbUpsertSourceRow({ path: relPath, content }) {
  const p = assertSafeMemoriesRelPath(relPath);
  const row = { path: p, content: String(content || ""), updated_at: nowIso() };
  await supabaseRest("sources", { method: "POST", query: { on_conflict: "path", select: "id" }, body: [row] });
}

async function sbGetMemoryByPath(relPath) {
  const p = assertSafeMemoriesRelPath(relPath);
  const rows = await supabaseRest("memories", { method: "GET", query: { select: "*", path: `eq.${p}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function sbDeleteMemoryByPath(relPath) {
  const p = assertSafeMemoriesRelPath(relPath);
  await supabaseRest("memories", { method: "DELETE", query: { path: `eq.${p}` } });
}

async function sbMoveMemory(fromRel, toRel) {
  const from = assertSafeMemoriesRelPath(fromRel);
  const to = assertSafeMemoriesRelPath(toRel);
  await supabaseRest("memories", { method: "PATCH", query: { path: `eq.${from}` }, body: { path: to, updated_at: nowIso() } });
}

function listItemsFromPaths(prefix, paths) {
  // Purpose: emulate a directory listing from a set of full paths.
  const pfx = String(prefix || "").replaceAll("\\", "/").replace(/\/+$/, "");
  const want = pfx ? pfx + "/" : "";
  const dirs = new Set();
  const files = new Set();

  for (const full of paths) {
    const rel = String(full || "").replaceAll("\\", "/");
    if (want && !rel.startsWith(want)) continue;
    const rest = want ? rel.slice(want.length) : rel;
    if (!rest) continue;
    const seg = rest.split("/")[0];
    if (!seg) continue;
    if (rest.includes("/")) dirs.add(seg);
    else files.add(seg);
  }

  return [
    ...Array.from(dirs).sort().map((name) => ({ name, type: "dir" })),
    ...Array.from(files).sort().map((name) => ({ name, type: "file" })),
  ];
}

async function sbListVirtualDir(relDir) {
  const p = String(relDir || "").replaceAll("\\", "/").trim() || "memories";
  if (!p.startsWith("memories")) throw new Error(`Only memories/ browsing supported in supabase mode: ${p}`);

  const likePrefix = p.replace(/\/+$/, "") + "/%";
  const rows = await supabaseRest("memories", { method: "GET", query: { select: "path", path: `like.${likePrefix}`, limit: "5000" } });
  const paths = (Array.isArray(rows) ? rows : []).map((r) => r.path);
  return { path: p, items: listItemsFromPaths(p, paths) };
}

async function sbListDiaryFiles() {
  const rows = await supabaseRest("memories", {
    method: "GET",
    query: { select: "path", path: "like.memories/diary/%", order: "path.desc", limit: "200" },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => String(r.path || ""));
}

function eprint(...args) {
  console.error(...args);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function filenameTimestamp() {
  // Lowercase, filesystem-friendly timestamp for filenames (e.g. 20251224t112233z)
  return nowIso().toLowerCase().replace(/[-:]/g, "").replace(/\./g, "");
}

function slugify(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "note";
}

function tokenize(s) {
  const m = String(s || "").toLowerCase().match(/[a-z0-9]{2,}/g);
  return new Set(m || []);
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

function approxTokensForText(s) {
  // Very rough but conservative-enough heuristic: ~4 bytes/token in English-ish text.
  // Purpose: keep embedding requests within model input limits without extra deps.
  const bytes = Buffer.byteLength(String(s || ""), "utf8");
  return Math.ceil(bytes / 4);
}

function trimToApproxTokens(s, maxTokens) {
  const maxT = Math.max(256, Number(maxTokens) || 0);
  let out = String(s || "");
  if (!out) return out;
  if (approxTokensForText(out) <= maxT) return out;

  // First cut by byte ratio (fast).
  const maxBytes = maxT * 4;
  const bytes = Buffer.byteLength(out, "utf8");
  const ratio = maxBytes / Math.max(1, bytes);
  out = out.slice(0, Math.max(1, Math.floor(out.length * ratio)));

  // Tighten with a few passes.
  for (let i = 0; i < 8 && out && approxTokensForText(out) > maxT; i++) {
    out = out.slice(0, Math.max(1, Math.floor(out.length * 0.92)));
  }
  return out;
}

function trimForEmbedding(text) {
  // Keep a safety margin under the common ~8192 token embedding limit.
  // Configurable for experimentation.
  const maxTokens = Number(process.env.ENKIDU_EMBED_MAX_TOKENS || 7800);
  return trimToApproxTokens(String(text || ""), maxTokens);
}

function toSingleLine(s, maxLen = 280) {
  const t = String(s || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).trim() + "…";
}

function splitTags(tagsStr) {
  return String(tagsStr || "")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function mergeTagsStrings(a, b) {
  const out = [];
  const seen = new Set();
  for (const t of [...splitTags(a), ...splitTags(b)]) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(", ");
}

function normaliseSourcesMeta(meta) {
  const name = toSingleLine(meta?.name || "", 120);
  const tags = mergeTagsStrings("", meta?.tags || "");
  const context = toSingleLine(meta?.context || "", 300);
  const dd = String(meta?.default_dest || meta?.dest || "auto").toLowerCase().trim();
  const allowed = new Set(["auto", "inbox", "people", "projects", "howto"]);
  const default_dest = allowed.has(dd) ? dd : "auto";
  return { name, tags, context, default_dest };
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function l2norm(a) {
  return Math.sqrt(dot(a, a)) || 1;
}

function cosineSim(a, b) {
  return dot(a, b) / (l2norm(a) * l2norm(b));
}

function isCuratableMemoryPath(rel) {
  const p = String(rel || "").replaceAll("\\", "/");
  if (!p.toLowerCase().startsWith("memories/") || !p.toLowerCase().endsWith(".md")) return false;
  if (p.toLowerCase().startsWith("memories/sources/verbatim/")) return false; // read-only sources
  if (p.toLowerCase().startsWith("memories/diary/")) return false; // diary is auto/log
  return true;
}

function buildDuplicateReport({ entries, embeddingsCache }) {
  const cacheItems = embeddingsCache?.items || {};
  const threshold = Math.max(0.90, Math.min(0.999, Number(process.env.ENKIDU_DEDUPE_SIM_THRESHOLD || 0.985)));
  const maxPairs = Math.max(10, Math.min(200, Number(process.env.ENKIDU_DEDUPE_MAX_PAIRS || 60)));
  const maxComparisons = Math.max(500, Math.min(50000, Number(process.env.ENKIDU_DEDUPE_MAX_COMPARISONS || 12000)));

  const entryByPath = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const rel = String(e?.path || "").replaceAll("\\", "/");
    if (!rel) continue;
    entryByPath.set(rel, e);
  }

  // Exact duplicates via body hash stored in embeddings cache.
  const byHash = new Map(); // hash -> [path]
  for (const rel of entryByPath.keys()) {
    if (!isCuratableMemoryPath(rel)) continue;
    const h = cacheItems?.[rel]?.hash;
    if (!h) continue;
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(rel);
  }
  const exact_same_hash = [];
  for (const [hash, paths] of byHash.entries()) {
    if ((paths || []).length <= 1) continue;
    exact_same_hash.push({ hash, paths: paths.slice().sort() });
  }
  exact_same_hash.sort((a, b) => (b.paths?.length || 0) - (a.paths?.length || 0));

  // Near-duplicates: only compare within title-slug groups to avoid O(n^2) blowups.
  const groups = new Map(); // key -> [path]
  for (const [rel, e] of entryByPath.entries()) {
    if (!isCuratableMemoryPath(rel)) continue;
    const title = String(e?.title || "").trim();
    const key = slugify(title).slice(0, 80) || "untitled";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rel);
  }

  let comparisons = 0;
  const near_duplicates = [];
  for (const paths of groups.values()) {
    if (!paths || paths.length <= 1) continue;
    // cap per-group work
    const ps = paths.slice(0, 12);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (comparisons++ > maxComparisons) break;
        const a = ps[i];
        const b = ps[j];
        const va = cacheItems?.[a]?.vector;
        const vb = cacheItems?.[b]?.vector;
        if (!Array.isArray(va) || !Array.isArray(vb)) continue;
        const score = cosineSim(va, vb);
        if (score < threshold) continue;
        const ea = entryByPath.get(a) || {};
        const eb = entryByPath.get(b) || {};
        near_duplicates.push({
          score: Math.round(score * 10000) / 10000,
          a: { path: a, title: ea.title || "", updated: ea.updated || "", importance: ea.importance ?? 0 },
          b: { path: b, title: eb.title || "", updated: eb.updated || "", importance: eb.importance ?? 0 },
        });
        if (near_duplicates.length >= maxPairs) break;
      }
      if (comparisons > maxComparisons || near_duplicates.length >= maxPairs) break;
    }
    if (comparisons > maxComparisons || near_duplicates.length >= maxPairs) break;
  }
  near_duplicates.sort((x, y) => (y.score || 0) - (x.score || 0));

  return {
    params: { threshold, maxPairs, maxComparisons, comparisons },
    exact_same_hash: exact_same_hash.slice(0, 30),
    near_duplicates: near_duplicates.slice(0, maxPairs),
  };
}

async function appendSessionEvent(role, content, meta = {}) {
  if (isSupabaseMode()) return await sbInsertSessionEvent(role, content, meta);
  await ensureDirs();
  const evt = {
    ts: nowIso(),
    role: String(role || ""),
    content: String(content || ""),
    ...meta,
  };
  await fsp.appendFile(SESSION_LOG_FILE, JSON.stringify(evt) + "\n", "utf8");
}

async function loadRecentSessionEvents(maxN = 30) {
  if (isSupabaseMode()) return await sbLoadRecentSessionEvents(maxN);
  if (!fs.existsSync(SESSION_LOG_FILE)) return [];
  const raw = await readFileUtf8(SESSION_LOG_FILE);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-maxN);
  const out = [];
  for (const line of tail) {
    try {
      const obj = JSON.parse(line);
      if (obj && (obj.role === "user" || obj.role === "assistant") && String(obj.content || "").trim()) out.push(obj);
    } catch {
      // ignore bad lines
    }
  }
  return out;
}

function formatRecentSessionForPrompt(events) {
  // Keep it concise and readable; this is "episodic memory".
  return events
    .map((e) => {
      const role = e.role === "user" ? "User" : "Assistant";
      return `${role}: ${String(e.content || "").trim()}`;
    })
    .join("\n");
}

async function ensureDirs() {
  await fsp.mkdir(MEMORIES_DIR, { recursive: true });
  await fsp.mkdir(SESSIONS_DIR, { recursive: true });
  await fsp.mkdir(INSTRUCTIONS_DIR, { recursive: true });
  await fsp.mkdir(SOURCES_VERBATIM_DIR, { recursive: true });
  for (const d of MEMORY_FOLDERS) await fsp.mkdir(d, { recursive: true });
}

function loadDotenvIfPresent() {
  // Minimal .env parser (no deps). Does NOT override existing env vars.
  if (!fs.existsSync(DOTENV_FILE)) return;
  const raw = fs.readFileSync(DOTENV_FILE, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^export\s+/i.test(line)) line = line.replace(/^export\s+/i, "");
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    v = v.replace(/^["']|["']$/g, ""); // strip simple surrounding quotes
    if (!k) continue;
    if (process.env[k] !== undefined) continue;
    process.env[k] = v;
  }
}

async function writeFileUtf8(p, content) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content, "utf8");
}

async function readFileUtf8(p) {
  return await fsp.readFile(p, "utf8");
}

function safeRelPath(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

function assertWithinMemories(absPath) {
  const resolved = path.resolve(absPath);
  const root = path.resolve(MEMORIES_DIR);
  if (resolved === root) return; // allow the memories/ root itself
  const rootPrefix = root + path.sep;
  if (!resolved.startsWith(rootPrefix)) throw new Error(`Path escapes memories/: ${resolved}`);
}

function assertWithinWritableRoots(absPath) {
  // Dream is allowed to modify only memories/ and instructions/.
  const resolved = path.resolve(absPath);
  const roots = [path.resolve(MEMORIES_DIR), path.resolve(INSTRUCTIONS_DIR)];
  for (const r of roots) {
    if (resolved === r) return;
    const prefix = r + path.sep;
    if (resolved.startsWith(prefix)) return;
  }
  throw new Error(`Path escapes writable roots: ${resolved}`);
}

function assertNotProtectedWritable(absPath) {
  // Keep generated/index + verbatim sources under code control.
  const resolved = path.resolve(absPath);
  const protectedPaths = [
    path.resolve(INDEX_FILE),
    path.resolve(EMBEDDINGS_FILE),
    path.resolve(SOURCE_EMBEDDINGS_FILE),
  ];
  if (protectedPaths.includes(resolved)) throw new Error(`Protected path (not editable by dream): ${safeRelPath(resolved)}`);

  const verbatimRoot = path.resolve(SOURCES_VERBATIM_DIR) + path.sep;
  if (resolved.startsWith(verbatimRoot)) throw new Error(`Protected path (read-only sources): ${safeRelPath(resolved)}`);
}

function parseFrontMatter(text) {
  // Tiny YAML-ish front matter parser (no deps).
  // ---
  // key: value
  // ---
  const lines = String(text || "").split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== "---") return {};

  const out = {};
  for (let i = 1; i < Math.min(lines.length, 200); i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

function stripFrontMatter(text) {
  const s = String(text || "");
  if (!s.startsWith("---")) return s;
  const parts = s.split(/---/);
  if (parts.length >= 3) return parts.slice(2).join("---");
  return s;
}

async function iterMemoryMarkdownFiles() {
  // Walk memories/ recursively and return *.md (excluding diary index file).
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(p);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        out.push(p);
      }
    }
  }
  if (fs.existsSync(MEMORIES_DIR)) await walk(MEMORIES_DIR);
  out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return out;
}

async function buildIndex() {
  await ensureDirs();
  const files = await iterMemoryMarkdownFiles();
  const entries = [];

  for (const p of files) {
    const text = await readFileUtf8(p);
    const fm = parseFrontMatter(text);

    const st = await fsp.stat(p);
    const updated = new Date(st.mtimeMs).toISOString().replace(/\.\d{3}Z$/, "Z");
    const title = fm.title || path.basename(p, ".md");
    const created = fm.created || updated;

    const tagsRaw = fm.tags || "";
    const tags = tagsRaw
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const importanceRaw = fm.importance || "";
    const importance = Number.isFinite(Number(importanceRaw)) ? Number(importanceRaw) : 0;

    let body = text;
    if (body.startsWith("---")) {
      const parts = body.split(/---/);
      if (parts.length >= 3) body = parts.slice(2).join("---");
    }
    const preview = body.replace(/\s+/g, " ").trim().slice(0, 240);

    entries.push({
      path: safeRelPath(p),
      title,
      tags,
      importance,
      created,
      updated,
      preview,
    });
  }

  entries.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.path.localeCompare(b.path)));
  return entries;
}

async function writeIndex(entries) {
  await ensureDirs();
  const data = { generated_at: nowIso(), count: entries.length, entries };
  await writeFileUtf8(INDEX_FILE, JSON.stringify(data, null, 2) + "\n");
}

async function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    const entries = await buildIndex();
    await writeIndex(entries);
  }
  return JSON.parse(await readFileUtf8(INDEX_FILE));
}

async function openaiEmbed(text, opts = {}) {
  loadDotenvIfPresent();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  const model = String(opts.model || "").trim() || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

  const url = `${baseUrl}/embeddings`;
  // Always enforce token-budget trimming here (defensive), even if callers forget.
  let inputText = trimForEmbedding(String(text || ""));
  let payload = { model, input: inputText };

  function isTooLongEmbedError(status, raw) {
    const s = Number(status) || 0;
    if (s !== 400) return false;
    const t = String(raw || "").toLowerCase();
    return t.includes("maximum context length") || t.includes("context length") || t.includes("reduce your prompt");
  }

  const maxRetries = Math.max(0, Math.min(8, Number(process.env.ENKIDU_OPENAI_RETRIES ?? 4) || 4));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await resp.text();
      if (!resp.ok) {
        // If we still somehow exceeded token limits, shrink and retry.
        if (attempt < maxRetries && isTooLongEmbedError(resp.status, raw)) {
          // Reduce by ~30% and retry.
          const maxT = Math.max(512, Math.floor(Number(process.env.ENKIDU_EMBED_MAX_TOKENS || 7800) * Math.pow(0.7, attempt + 1)));
          inputText = trimToApproxTokens(inputText, maxT);
          payload = { model, input: inputText };
          await sleepMs(backoffMs(attempt));
          continue;
        }
        const msg = formatOpenAiHttpError(resp.status, raw);
        if (attempt < maxRetries && isRetryableHttpStatus(resp.status)) {
          await sleepMs(backoffMs(attempt));
          continue;
        }
        throw new Error(msg);
      }

      const data = safeJsonParse(raw);
      const vec = data?.data?.[0]?.embedding;
      if (!Array.isArray(vec)) throw new Error(`Unexpected embeddings response: ${truncateForError(raw)}`);
      return vec;
    } catch (err) {
      if (attempt < maxRetries && isRetryableNetworkError(err)) {
        await sleepMs(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("OpenAI embeddings failed after retries");
}

async function loadEmbeddingsCache() {
  if (!fs.existsSync(EMBEDDINGS_FILE)) return null;
  try {
    return JSON.parse(await readFileUtf8(EMBEDDINGS_FILE));
  } catch {
    return null;
  }
}

async function writeEmbeddingsCache(cache) {
  await ensureDirs();
  await writeFileUtf8(EMBEDDINGS_FILE, JSON.stringify(cache, null, 2) + "\n");
}

async function loadSourceEmbeddingsCache() {
  if (!fs.existsSync(SOURCE_EMBEDDINGS_FILE)) return null;
  try {
    return JSON.parse(await readFileUtf8(SOURCE_EMBEDDINGS_FILE));
  } catch {
    return null;
  }
}

async function writeSourceEmbeddingsCache(cache) {
  await ensureDirs();
  await writeFileUtf8(SOURCE_EMBEDDINGS_FILE, JSON.stringify(cache, null, 2) + "\n");
}

async function ensureSourceEmbeddingsCache() {
  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const existing = await loadSourceEmbeddingsCache();
  if (existing && existing.items) return existing;
  const fresh = { model, generated_at: nowIso(), items: {} };
  await writeSourceEmbeddingsCache(fresh);
  return fresh;
}

async function updateEmbeddingForSourcePath(relPath) {
  const rel = String(relPath || "").replaceAll("\\", "/");
  if (!rel.toLowerCase().startsWith("memories/sources/") || !rel.toLowerCase().endsWith(".md")) return;

  const abs = path.join(REPO_ROOT, rel);
  assertWithinMemories(abs);
  if (!fs.existsSync(abs)) return;

  const md = await readFileUtf8(abs);
  const body = stripFrontMatter(md).trim();
  const h = sha256Hex(body);

  const cache = await ensureSourceEmbeddingsCache();
  cache.items = cache.items || {};
  const prev = cache.items[rel];
  if (prev && prev.hash === h && Array.isArray(prev.vector)) return;

  const embedText = trimForEmbedding(body);
  const vec = await openaiEmbed(embedText, { model: cache.model || DEFAULT_EMBEDDING_MODEL });
  cache.items[rel] = { hash: h, vector: vec };
  cache.generated_at = nowIso();
  await writeSourceEmbeddingsCache(cache);
}

async function listStoredSourceVerbatimFiles() {
  if (!fs.existsSync(SOURCES_VERBATIM_DIR)) return [];
  const ents = await fsp.readdir(SOURCES_VERBATIM_DIR);
  return ents
    .filter((n) => n.toLowerCase().endsWith(".md"))
    .map((n) => `memories/sources/verbatim/${n}`);
}

async function retrieveTopSourcesByEmbeddings(queries, topN) {
  // Sources embeddings are local-file based for now.
  if (isSupabaseMode()) return [];
  const cache = await loadSourceEmbeddingsCache();
  if (!cache || !cache.items) return [];

  const qs = (Array.isArray(queries) ? queries : [String(queries || "")]).map((s) => String(s || "").trim()).filter(Boolean);
  if (!qs.length) return [];

  const qVecs = [];
  for (const q of qs) qVecs.push(await openaiEmbed(q, { model: cache.model || DEFAULT_EMBEDDING_MODEL }));

  const all = await listStoredSourceVerbatimFiles();
  const scored = [];
  for (const rel of all) {
    const item = cache.items[rel];
    if (!item || !Array.isArray(item.vector)) continue;
    let best = -1;
    for (const qv of qVecs) best = Math.max(best, cosineSim(qv, item.vector));
    scored.push([best, rel]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const picked = scored.slice(0, topN).map((x) => x[1]);

  const out = [];
  for (const rel of picked) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    out.push({ path: rel, content: await readFileUtf8(abs) });
  }
  return out;
}

function wantsVerbatimSources(prompt) {
  const p = String(prompt || "").toLowerCase();
  return (
    p.includes("full text") ||
    p.includes("verbatim") ||
    p.includes("quote") ||
    p.includes("quotes") ||
    p.includes("exact wording") ||
    p.includes("exact text")
  );
}

async function ensureEmbeddingsCache() {
  // Create an embeddings cache lazily so auto-embed can work immediately after the first capture.
  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const existing = await loadEmbeddingsCache();
  if (existing && existing.items) return existing;
  const fresh = { model, generated_at: nowIso(), items: {} };
  await writeEmbeddingsCache(fresh);
  return fresh;
}

async function updateEmbeddingForMemoryPath(relPath) {
  // Incrementally embed a single memories/*.md file.
  // Uses hash of body (front-matter stripped) so we only re-embed when content changes.
  const rel = String(relPath || "");
  if (!rel.toLowerCase().startsWith("memories/") || !rel.toLowerCase().endsWith(".md")) return;

  const abs = path.join(REPO_ROOT, rel);
  assertWithinMemories(abs);
  if (!fs.existsSync(abs)) return;

  const md = await readFileUtf8(abs);
  const body = stripFrontMatter(md).trim();
  const h = sha256Hex(body);

  const cache = await ensureEmbeddingsCache();
  cache.items = cache.items || {};
  const prev = cache.items[rel];
  if (prev && prev.hash === h && Array.isArray(prev.vector)) return;

  const embedText = trimForEmbedding(body);
  const vec = await openaiEmbed(embedText, { model: cache.model || DEFAULT_EMBEDDING_MODEL });
  cache.items[rel] = { hash: h, vector: vec };
  cache.generated_at = nowIso();
  await writeEmbeddingsCache(cache);
}

async function cmdEmbed(args = {}) {
  await ensureDirs();
  const model = String(args.model || "").trim() || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

  const idx = await loadIndex();
  const entries = idx.entries || [];

  const cache = (await loadEmbeddingsCache()) || { model, generated_at: nowIso(), items: {} };
  cache.model = model;
  cache.generated_at = nowIso();
  cache.items = cache.items || {};

  // Normalise cache keys so moves/OS path separators don't break lookups.
  // - Convert absolute paths under repo into repo-relative paths.
  // - Convert backslashes to forward slashes.
  for (const k of Object.keys(cache.items)) {
    let nk = String(k || "");
    if (path.isAbsolute(nk)) nk = safeRelPath(nk);
    nk = nk.replaceAll("\\", "/").replace(/^\.\/+/, "");
    if (nk !== k) {
      cache.items[nk] = cache.items[k];
      delete cache.items[k];
    }
  }

  const currentPaths = new Set(entries.map((e) => String(e.path || "").replaceAll("\\", "/")));

  let updated = 0;
  for (const e of entries) {
    const rel = String(e.path || "");
    const abs = path.join(REPO_ROOT, rel);
    assertWithinMemories(abs);
    if (!fs.existsSync(abs)) continue;

    const md = await readFileUtf8(abs);
    const body = stripFrontMatter(md).trim();
    const h = sha256Hex(body);

    const prev = cache.items[rel];
    if (prev && prev.hash === h && Array.isArray(prev.vector)) continue;

    // Keep embedding input bounded by token budget.
    const embedText = trimForEmbedding(body);
    const vec = await openaiEmbed(embedText, { model });
    cache.items[rel] = { hash: h, vector: vec };
    updated += 1;
  }

  // Prune embeddings for files that no longer exist in the index (e.g. after dream moves/renames/deletes).
  for (const k of Object.keys(cache.items)) {
    if (!currentPaths.has(String(k || ""))) delete cache.items[k];
  }

  await writeEmbeddingsCache(cache);
  console.log(`Embeddings updated: ${updated} file(s). Cache: ${safeRelPath(EMBEDDINGS_FILE)}`);
}

async function retrieveTopMemoriesByEmbeddings(queries, topN) {
  // Embeddings are local-file based for now.
  if (isSupabaseMode()) return null;
  const idx = await loadIndex();
  const entries = idx.entries || [];
  const cache = await loadEmbeddingsCache();
  if (!cache || !cache.items) return null;

  const qs = (Array.isArray(queries) ? queries : [String(queries || "")]).map((s) => String(s || "").trim()).filter(Boolean);
  if (!qs.length) return [];

  const qVecs = [];
  for (const q of qs) qVecs.push(await openaiEmbed(q, { model: cache.model || DEFAULT_EMBEDDING_MODEL }));

  const scored = [];
  for (const e of entries) {
    const rel = String(e.path || "");
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const item = cache.items[rel];
    if (!item || !Array.isArray(item.vector)) continue;
    let best = -1;
    for (const qv of qVecs) best = Math.max(best, cosineSim(qv, item.vector));
    const imp = Number.isFinite(Number(e.importance)) ? Number(e.importance) : 0;
    scored.push([best + imp * IMPORTANCE_WEIGHT_EMBED, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);

  const picked = scored.slice(0, topN).map((x) => x[1]);
  const out = [];
  for (const e of picked) {
    const p = path.join(REPO_ROOT, e.path);
    const text = await readFileUtf8(p);
    out.push({ entry: e, text });
  }
  return out;
}

function heuristicRoute(prompt) {
  const p = String(prompt || "").toLowerCase();
  const words = p.match(/[a-z0-9']+/g) || [];

  const recencyHints = [
    "recently",
    "last time",
    "catch me up",
    "where were we",
    "what have we been talking",
    "recap",
    "summary",
    "continue",
  ];
  const needRecency = recencyHints.some((h) => p.includes(h));

  const vagueHints = ["something", "anything", "recommend", "suggest", "find me", "i would like", "a poem"];
  const needExpansion = (words.length <= 8 && vagueHints.some((h) => p.includes(h))) || p.includes("i would like");

  return {
    needRecency,
    needExpansion,
  };
}

async function expandQueriesWithAI(prompt, model) {
  // Only used when heuristicRoute says the prompt is vague.
  const system = [
    "You expand a user's request into multiple retrieval queries.",
    "Return ONLY valid JSON of the form: {\"queries\": [\"...\", \"...\", ...]}",
    "Rules:",
    "- 3 to 6 queries",
    "- short phrases, not full sentences",
    "- include likely synonyms and related terms",
  ].join("\n");

  const messages = [
    { role: "system", content: system },
    { role: "user", content: String(prompt || "") },
  ];

  const raw = await openaiChat(messages, { model });
  const parsed = safeJsonParse(raw);
  const qs = parsed && Array.isArray(parsed.queries) ? parsed.queries : [];
  return qs.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 6);
}

async function retrieveTopMemories(prompt, topN) {
  if (isSupabaseMode()) return await retrieveTopMemoriesSupabase(prompt, topN);
  const idx = await loadIndex();
  const entries = idx.entries || [];

  // If embeddings exist, use cosine similarity ranking.
  const cache = await loadEmbeddingsCache();
  if (cache && cache.items) {
    const out = await retrieveTopMemoriesByEmbeddings([String(prompt || "")], topN);
    if (out) return out;
  }

  // Fallback: keyword overlap scoring.
  const promptTokens = tokenize(prompt);
  const scored = [];

  for (const e of entries) {
    const p = path.join(REPO_ROOT, e.path);
    if (!fs.existsSync(p)) continue;
    const text = await readFileUtf8(p);
    const title = String(e.title || "");
    let score = 0;
    score += 3 * intersectionSize(tokenize(title), promptTokens);
    score += 1 * intersectionSize(tokenize(text), promptTokens);
    const imp = Number.isFinite(Number(e.importance)) ? Number(e.importance) : 0;
    score += imp * IMPORTANCE_WEIGHT_KEYWORD;
    if (score > 0) scored.push([score, e, text]);
  }

  scored.sort((a, b) => {
    if (a[0] !== b[0]) return b[0] - a[0];
    return String(b[1].updated || "").localeCompare(String(a[1].updated || ""));
  });

  return scored.slice(0, topN).map(([_, e, text]) => ({ entry: e, text }));
}

async function retrieveTopMemoriesSupabase(prompt, topN) {
  // Minimal retrieval: pull a small candidate set from SQL and rank via keyword overlap.
  const n = Math.max(1, Number(topN) || 5);
  const promptTokens = tokenize(prompt);
  const tokens = Array.from(promptTokens).slice(0, 10);

  const query = { select: "path,title,tags,importance,content,created_at,updated_at", limit: "80", order: "updated_at.desc" };
  if (tokens.length) {
    const ors = [];
    for (const t of tokens) {
      const pat = `*${t}*`;
      ors.push(`title.ilike.${pat}`);
      ors.push(`content.ilike.${pat}`);
    }
    query.or = `(${ors.join(",")})`;
  }

  const rows = await supabaseRest("memories", { method: "GET", query });
  const scored = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const title = String(r?.title || "");
    const content = String(r?.content || "");
    let score = 0;
    score += 3 * intersectionSize(tokenize(title), promptTokens);
    score += 1 * intersectionSize(tokenize(content), promptTokens);
    const imp = Number.isFinite(Number(r?.importance)) ? Number(r.importance) : 0;
    score += imp * IMPORTANCE_WEIGHT_KEYWORD;
    if (score > 0 || !tokens.length) {
      scored.push([
        score,
        {
          path: String(r?.path || ""),
          title,
          tags: Array.isArray(r?.tags) ? r.tags : [],
          importance: imp,
          created: r?.created_at || "",
          updated: r?.updated_at || "",
        },
        content,
      ]);
    }
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, n).map(([_, entry, text]) => ({ entry, text }));
}

function intersectionSize(aSet, bSet) {
  let c = 0;
  for (const x of aSet) if (bSet.has(x)) c++;
  return c;
}

function extractWebFetchUrl(text) {
  // Web request contract:
  // ===WEB_FETCH=== https://example.com
  const s = String(text || "");
  for (const rawLine of s.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^===WEB_FETCH===\s+(.+)$/);
    if (!m) continue;
    const url = m[1].trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return url;
  }
  return null;
}

function splitAnswerAndCapture(text) {
  // Work output contract (see instructions/work.md):
  // ...answer...
  // ===CAPTURE=== <json-or-null>
  const s = String(text || "");
  const marker = "===CAPTURE===";
  const idx = s.lastIndexOf(marker);
  if (idx === -1) return { answer: s.trim(), capture: null };

  const answer = s.slice(0, idx).trim();
  const tail = s.slice(idx + marker.length).trim();
  const firstLine = tail.split(/\r?\n/, 1)[0].trim(); // capture must be single-line JSON
  if (!firstLine || firstLine.toLowerCase() === "null") return { answer, capture: null };

  const cap = safeJsonParse(firstLine);
  // If capture JSON is invalid, still strip the marker line from the displayed answer.
  if (!cap) return { answer, capture: null };
  return { answer, capture: cap };
}

async function writeAutoCaptureToInbox(capture) {
  // Minimal validation; keep executor dumb.
  const title = String(capture?.title || "").trim();
  const text = String(capture?.text || "").trim();
  const tagsRaw = capture?.tags;

  if (!title || !text) return null;

  // De-dup is local-only (filesystem scan). Keep supabase mode simple.
  if (!isSupabaseMode()) {
    try {
      const inboxDir = path.join(MEMORIES_DIR, "inbox");
      const existing = await fsp.readdir(inboxDir);
      for (const name of existing) {
        if (!name.toLowerCase().endsWith(".md")) continue;
        const p = path.join(inboxDir, name);
        const md = await readFileUtf8(p);
        const fm = parseFrontMatter(md);
        const body = stripFrontMatter(md).trim();
        if (String(fm.title || "").trim() === title && body === text) return null;
      }
    } catch {
      // If inbox can't be read for any reason, just proceed.
    }
  }

  let tags = [];
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.map((t) => String(t).trim()).filter(Boolean);
  } else {
    tags = String(tagsRaw || "")
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const created = nowIso();
  const fname = `${filenameTimestamp()}_${slugify(title).slice(0, 60)}.md`.toLowerCase();
  const rel = `memories/inbox/${fname}`;

  const md = [
    "---",
    `title: ${title}`,
    `created: ${created}`,
    `tags: ${tags.join(", ")}`,
    "importance: 1",
    "source: auto_capture",
    "---",
    "",
    text,
    "",
  ].join("\n");

  if (isSupabaseMode()) {
    await sbUpsertMemoryRow({ path: rel, content: md, title, tags, importance: 1 });
    return rel;
  }

  const p = path.join(REPO_ROOT, rel);
  assertWithinMemories(p);
  await writeFileUtf8(p, md);
  const entries = await buildIndex();
  await writeIndex(entries);
  // Keep embeddings up to date whenever a memory is created.
  await updateEmbeddingForMemoryPath(rel);
  return rel;
}

async function fetchWebText(url) {
  // Simple web fetch for model-requested lookup (no JS execution).
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http(s) URLs supported");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      // Some sites behave better with a UA.
      "User-Agent": "enkidu-local/0.1 (+https://local)",
      Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
    },
  });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(`Fetch HTTP ${resp.status}`);

  // Keep context bounded.
  const text = raw.slice(0, 20000);
  return text;
}

function normaliseHistory(history) {
  // Accept [{role:'user'|'assistant', content:'...'}] and keep only those roles.
  const out = [];
  if (!Array.isArray(history)) return out;
  for (const m of history) {
    const role = String(m?.role || "").toLowerCase();
    const content = String(m?.content || "");
    if (!content.trim()) continue;
    if (role === "user" || role === "assistant") out.push({ role, content });
  }
  // Bound size to keep prompts sane (last 20 messages).
  return out.slice(-20);
}

// -----------------------------
// Work pipeline split (plan -> answer)
// -----------------------------

const WORK_PLAN_CACHE = new Map(); // planToken -> { createdAtMs, plan }
const WORK_PLAN_TTL_MS = 2 * 60 * 1000;

const DREAM_PLAN_CACHE = new Map(); // planToken -> { createdAtMs, plan }
const DREAM_PLAN_TTL_MS = 10 * 60 * 1000;
let EMBED_REFRESH_RUNNING = false;

function makeWorkPlanToken() {
  return crypto.randomBytes(16).toString("hex");
}

function makeDreamPlanToken() {
  return crypto.randomBytes(16).toString("hex");
}

function pruneWorkPlanCache() {
  const now = Date.now();
  for (const [k, v] of WORK_PLAN_CACHE.entries()) {
    if (!v || now - (v.createdAtMs || 0) > WORK_PLAN_TTL_MS) WORK_PLAN_CACHE.delete(k);
  }
}

function pruneDreamPlanCache() {
  const now = Date.now();
  for (const [k, v] of DREAM_PLAN_CACHE.entries()) {
    if (!v || now - (v.createdAtMs || 0) > DREAM_PLAN_TTL_MS) DREAM_PLAN_CACHE.delete(k);
  }
}

async function workPlanCore({ prompt, model, history, runNow }) {
  const instruction = await readInstruction(WORK_INSTRUCTION_FILE);
  const fast = Boolean(runNow);
  const route = fast ? { needRecency: false, needExpansion: false } : heuristicRoute(prompt);

  // Recency (episodic memory): always available across sessions.
  const recentEvents = route.needRecency ? await loadRecentSessionEvents(30) : [];

  // Heuristic-first: expand only when prompt is vague.
  // If expansion fails/returns empty, fall back to the original prompt.
  const expanded = route.needExpansion ? await expandQueriesWithAI(prompt, model) : [];
  const queries = expanded.length ? expanded : [prompt];

  // Semantic retrieval: embeddings if available, otherwise keyword fallback inside retrieveTopMemories().
  let top = [];
  if (!fast) {
    const topEmb = await retrieveTopMemoriesByEmbeddings(queries, 5);
    top = topEmb && topEmb.length ? topEmb : await retrieveTopMemories(prompt, 5);
  }

  const memChunks = top.map(({ entry, text }) => {
    return [
      `[Memory] ${entry.title || ""}`,
      `Path: ${entry.path || ""}`,
      `Tags: ${(entry.tags || []).join(", ")}`,
      "---",
      String(text || "").trim(),
    ].join("\n");
  });

  const userParts = [];
  if (recentEvents.length) {
    userParts.push("Recent conversation (episodic memory):\n\n" + formatRecentSessionForPrompt(recentEvents));
  }
  if (memChunks.length) userParts.push("Relevant memories (may be incomplete):\n\n" + memChunks.join("\n\n"));

  // Read-only sources (server-side verbatim store + embeddings).
  const storedSources = fast ? [] : await retrieveTopSourcesByEmbeddings(queries, 3);
  if (storedSources.length) {
    const maxChars = wantsVerbatimSources(prompt) ? 20000 : 4000;
    const srcChunks = storedSources
      .map((s) => {
        const p = String(s?.path || "");
        const c = String(s?.content || "").slice(0, maxChars).trim();
        return [`[Source] ${p}`, "---", c].join("\n");
      })
      .join("\n\n");
    userParts.push("Relevant sources (verbatim, read-only):\n\n" + srcChunks);
  }

  userParts.push("User prompt:\n\n" + prompt);

  const usedMemories = top.map(({ entry }) => ({
    title: entry.title || "",
    path: entry.path || "",
    tags: entry.tags || [],
    importance: Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : 0,
  }));
  const usedSources = storedSources.map((s) => ({ path: s.path || "" }));

  return {
    prompt,
    model,
    instruction,
    historyNorm: normaliseHistory(history),
    userContent: userParts.join("\n\n"),
    usedMemories,
    usedSources,
    route,
    queries,
    fast,
  };
}

async function workAnswerCore(plan) {
  const instruction = String(plan?.instruction || "");
  const historyNorm = Array.isArray(plan?.historyNorm) ? plan.historyNorm : [];
  const userContent = String(plan?.userContent || "");
  const model = String(plan?.model || "").trim();

  const messages = [
    { role: "system", content: instruction },
    ...historyNorm,
    { role: "user", content: userContent },
  ];

  // First attempt
  const raw1 = await openaiChat(messages, { model });

  // If the model requests a web fetch, do ONE fetch then ask again with the fetched text.
  const url = extractWebFetchUrl(raw1);
  if (!url) return { raw: raw1 };

  const webText = await fetchWebText(url);
  const messages2 = [
    { role: "system", content: instruction },
    ...historyNorm,
    {
      role: "user",
      content:
        "Web content fetched for you. Use it if helpful.\n\n" +
        `URL: ${url}\n\n` +
        "CONTENT_START\n" +
        webText +
        "\nCONTENT_END\n\n" +
        userContent,
    },
  ];

  const raw2 = await openaiChat(messages2, { model });
  const url2 = extractWebFetchUrl(raw2);
  if (url2) {
    return {
      raw: "I tried one web fetch already, but you requested another. Please answer using the fetched content I provided.",
    };
  }
  return { raw: raw2 };
}

async function workCore({ prompt, model, history, runNow }) {
  const plan = await workPlanCore({ prompt, model, history, runNow });
  const { raw } = await workAnswerCore(plan);
  return { raw, usedMemories: plan.usedMemories, usedSources: plan.usedSources };
}

function truncateForError(s, maxLen = 600) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + " …";
}

function isRetryableHttpStatus(status) {
  const s = Number(status) || 0;
  return s === 408 || s === 429 || s === 500 || s === 502 || s === 503 || s === 504;
}

function isRetryableNetworkError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  // Node fetch can throw on transient network failures.
  return (
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("eai_again") ||
    msg.includes("enotfound")
  );
}

function backoffMs(attempt) {
  const base = 300; // ms
  const cap = 5000;
  const exp = Math.min(cap, base * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 180);
  return exp + jitter;
}

async function sleepMs(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function formatOpenAiHttpError(status, raw) {
  const s = Number(status) || 0;
  const snippet = truncateForError(raw);
  if (s === 502 || s === 503 || s === 504) {
    return `OpenAI temporary upstream error (HTTP ${s}). Please retry. Details: ${snippet}`;
  }
  if (s === 429) {
    return `OpenAI rate limit (HTTP 429). Please retry shortly. Details: ${snippet}`;
  }
  return `OpenAI HTTP ${s}: ${snippet}`;
}

function scheduleEmbedRefresh(reason = "background") {
  if (EMBED_REFRESH_RUNNING) return false;
  EMBED_REFRESH_RUNNING = true;
  setTimeout(async () => {
    try {
      await cmdEmbed({});
      eprint(`[embed] refresh complete (${reason})`);
    } catch (e) {
      eprint(`[embed] refresh failed (${reason}):`, e?.message || e);
    } finally {
      EMBED_REFRESH_RUNNING = false;
    }
  }, 0);
  return true;
}

async function openaiChat(messages, opts = {}) {
  loadDotenvIfPresent();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  const model = String(opts.model || "").trim() || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const url = `${baseUrl}/chat/completions`;
  const payload = { model, messages };

  // Model-specific parameter handling:
  // gpt-5* currently rejects non-default temperature values (e.g., 0.2). Let it use defaults by omitting.
  if (!/^gpt-5/i.test(model)) {
    payload.temperature = 0.2;
  }

  const maxRetries = Math.max(0, Math.min(8, Number(process.env.ENKIDU_OPENAI_RETRIES ?? 4) || 4));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await resp.text();
      if (!resp.ok) {
        const msg = formatOpenAiHttpError(resp.status, raw);
        if (attempt < maxRetries && isRetryableHttpStatus(resp.status)) {
          await sleepMs(backoffMs(attempt));
          continue;
        }
        throw new Error(msg);
      }

      const data = safeJsonParse(raw);
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Unexpected OpenAI response: ${truncateForError(raw)}`);
      return content;
    } catch (err) {
      if (attempt < maxRetries && isRetryableNetworkError(err)) {
        await sleepMs(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("OpenAI chat failed after retries");
}

async function readInstruction(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing instruction file: ${safeRelPath(filePath)}`);
  return (await readFileUtf8(filePath)).trim();
}

// -----------------------------
// CLI commands
// -----------------------------

async function cmdInit() {
  await ensureDirs();
  const entries = await buildIndex();
  await writeIndex(entries);
  console.log("Initialized Enkidu.");
  console.log(`- ${safeRelPath(INSTRUCTIONS_DIR)}/`);
  console.log(`- ${safeRelPath(INDEX_FILE)}`);
}

async function cmdIndex() {
  const entries = await buildIndex();
  await writeIndex(entries);
  console.log(`Indexed ${entries.length} memory file(s) into ${safeRelPath(INDEX_FILE)}`);
}

function parseArgv(argv) {
  // Very small argv parser: subcommand + --key value + positionals.
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function cmdCapture(args) {
  if (!isSupabaseMode()) await ensureDirs();
  const title = String(args.title || "").trim();
  const text = String(args.text || "").trim();
  const tags = String(args.tags || "")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title) throw new Error("--title is required");
  if (!text) throw new Error("--text is required");

  const created = nowIso();
  const fname = `${filenameTimestamp()}_${slugify(title).slice(0, 60)}.md`.toLowerCase();
  const rel = `memories/inbox/${fname}`;

  const md = [
    "---",
    `title: ${title}`,
    `created: ${created}`,
    `tags: ${tags.join(", ")}`,
    "importance: 1",
    "source: capture",
    "---",
    "",
    text,
    "",
  ].join("\n");

  if (isSupabaseMode()) {
    await sbUpsertMemoryRow({ path: rel, content: md, title, tags, importance: 1 });
    console.log(`Captured: ${rel}`);
    return;
  }

  const p = path.join(REPO_ROOT, rel);
  await writeFileUtf8(p, md);
  const entries = await buildIndex();
  await writeIndex(entries);
  await updateEmbeddingForMemoryPath(rel);
  console.log(`Captured: ${rel}`);
}

async function cmdWork(args) {
  const prompt = String(args._[1] || "").trim();
  if (!prompt) throw new Error('Usage: node enkidu.js work \"your prompt\"');

  const { raw } = await workCore({ prompt, model: "", history: [], runNow: false });
  const { answer, capture } = splitAnswerAndCapture(raw);
  await writeAutoCaptureToInbox(capture);
  await appendSessionEvent("user", prompt);
  await appendSessionEvent("assistant", String(answer || "").trim());
  process.stdout.write(String(answer).trim() + "\n");
}

async function cmdDream(args = {}) {
  if (isSupabaseMode()) return await cmdDreamSupabase(args);
  // Soft dream: LLM decides what to do, via editable instructions.
  // Code stays dumb: it provides context, validates ops, applies ops under memories/, writes diary entry.
  await ensureDirs();

  const instruction = await readInstruction(DREAM_INSTRUCTION_FILE);
  const model = String(args.model || "").trim();

  // IMPORTANT: Do NOT send full contents of all memories (can exceed model context limits).
  // We do a 2-step flow:
  // 1) Send a compact catalog (metadata + previews) and ask which files to read.
  // 2) Provide full content only for that selected subset, then ask for ops+diary.

  const DREAM_CATALOG_MAX = Math.max(200, Math.min(5000, Number(process.env.ENKIDU_DREAM_CATALOG_MAX || 2000)));
  const DREAM_READ_MAX = Math.max(10, Math.min(120, Number(process.env.ENKIDU_DREAM_READ_MAX || 40)));

  const idx = await loadIndex();
  const entries = idx.entries || [];

  // Catalog: metadata only (no full content).
  const catalog = [];
  for (const e of entries.slice(0, DREAM_CATALOG_MAX)) {
    const rel = String(e?.path || "").replaceAll("\\", "/");
    if (!rel) continue;
    if (!rel.toLowerCase().endsWith(".md")) continue;
    catalog.push({
      path: rel,
      title: e.title || "",
      tags: e.tags || [],
      importance: Number.isFinite(Number(e.importance)) ? Number(e.importance) : 0,
      created: e.created || "",
      updated: e.updated || "",
      preview: e.preview || "",
    });
  }

  // Optional: provide duplicate candidates to help dream consolidate/delete redundancy.
  // We keep the executor dumb: it only *reports* possible duplicates; the model decides.
  let duplicate_report = null;
  try {
    const emb = await loadEmbeddingsCache();
    if (emb && emb.items) duplicate_report = buildDuplicateReport({ entries, embeddingsCache: emb });
  } catch {
    duplicate_report = null;
  }

  const instructionFiles = [];
  for (const rel of ["instructions/work.md", "instructions/dream.md"]) {
    const abs = path.join(REPO_ROOT, rel);
    assertWithinWritableRoots(abs);
    if (!fs.existsSync(abs)) continue;
    const content = await readFileUtf8(abs);
    instructionFiles.push({ path: rel, content });
  }

  // ---- Step 1: ask which files to read fully ----
  const step1 = {
    now: nowIso(),
    writable_roots: ["memories/", "instructions/"],
    note_count_total: entries.length,
    note_count_included_in_catalog: catalog.length,
    note_catalog_truncated: entries.length > catalog.length,
    catalog,
    duplicate_report,
    instructions: instructionFiles,
    output_contract: {
      want_read: ["memories/path.md", "instructions/work.md"],
      note: "one short sentence why you want these files",
    },
    constraints: {
      max_files_to_read: DREAM_READ_MAX,
      do_not_read_or_modify: ["memories/sources/verbatim/* (read-only)"],
    },
  };

  const messages1 = [
    { role: "system", content: instruction },
    {
      role: "user",
      content:
        "You are running DREAM (step 1/2).\n\n" +
        "Pick up to max_files_to_read files you need to read fully to make good edits.\n" +
        "Return ONLY valid JSON matching output_contract.\n\n" +
        JSON.stringify(step1, null, 2),
    },
  ];

  const raw1 = await openaiChat(messages1, { model });
  const parsed1 = safeJsonParse(raw1);
  const wantReadRaw = Array.isArray(parsed1?.want_read) ? parsed1.want_read : [];
  const wantRead = [];
  const seen = new Set();
  for (const p of wantReadRaw) {
    if (wantRead.length >= DREAM_READ_MAX) break;
    const rel = String(p || "").replaceAll("\\", "/").trim();
    if (!rel) continue;
    if (seen.has(rel)) continue;
    // Allow reading memories/*.md and instructions/*.md only.
    if (!(rel.toLowerCase().startsWith("memories/") || rel.toLowerCase().startsWith("instructions/"))) continue;
    // Never provide verbatim sources content to dream (read-only).
    if (rel.toLowerCase().startsWith("memories/sources/verbatim/")) continue;
    const abs = path.join(REPO_ROOT, rel);
    assertWithinWritableRoots(abs);
    // Don't allow reading protected generated files.
    try {
      assertNotProtectedWritable(abs);
    } catch {
      continue;
    }
    if (!fs.existsSync(abs)) continue;
    seen.add(rel);
    wantRead.push(rel);
  }

  const selected_files = [];
  for (const rel of wantRead) {
    const abs = path.join(REPO_ROOT, rel);
    const content = await readFileUtf8(abs);
    selected_files.push({ path: rel, content });
  }

  // ---- Step 2: perform operations using selected full contents ----
  const step2 = {
    now: nowIso(),
    writable_roots: ["memories/", "instructions/"],
    note_count_total: entries.length,
    note_catalog_truncated: entries.length > catalog.length,
    catalog,
    duplicate_report,
    selected_files,
    output_contract: {
      ops: [
        { op: "mkdir", path: "memories/someFolder" },
        { op: "write", path: "memories/path.md", content: "..." },
        { op: "move", from: "memories/a.md", to: "memories/b.md" },
        { op: "delete", path: "memories/old.md" },
      ],
      diary: "markdown string describing what you did and why",
    },
  };

  const messages2 = [
    { role: "system", content: instruction },
    {
      role: "user",
      content:
        "You are running DREAM (step 2/2).\n\n" +
        "You have a catalog of all notes (metadata+previews) and full contents for selected_files.\n" +
        "Return ONLY valid JSON matching output_contract.\n\n" +
        JSON.stringify(step2, null, 2),
    },
  ];

  const raw = await openaiChat(messages2, { model });
  const parsed = safeJsonParse(raw);
  if (!parsed) throw new Error("Dream did not return valid JSON.");

  const ops = Array.isArray(parsed.ops) ? parsed.ops : [];
  const diary = String(parsed.diary || "").trim();
  if (!diary) throw new Error("Dream JSON missing diary.");

  const applied = await applyDreamOps(ops);

  // Rebuild index after modifications.
  const newEntries = await buildIndex();
  await writeIndex(newEntries);

  // Write diary entry.
  const diaryTs = filenameTimestamp();
  const diaryPath = path.join(MEMORIES_DIR, "diary", `${diaryTs}_dream.md`.toLowerCase());
  const diaryMd = [
    "---",
    `title: Dream diary (${nowIso()})`,
    `created: ${nowIso()}`,
    "tags: diary, dream",
    "source: dream",
    "---",
    "",
    diary,
    "",
    "## Applied ops",
    "",
    "```json",
    JSON.stringify(applied, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFileUtf8(diaryPath, diaryMd);

  // After dream edits, refresh embeddings (incremental via hashes).
  await cmdEmbed({});

  console.log(`Dream complete. Diary: ${safeRelPath(diaryPath)}`);
}

async function dreamPlanOnly({ model }) {
  await ensureDirs();
  const instruction = await readInstruction(DREAM_INSTRUCTION_FILE);
  const m = String(model || "").trim();

  const DREAM_CATALOG_MAX = Math.max(200, Math.min(5000, Number(process.env.ENKIDU_DREAM_CATALOG_MAX || 2000)));
  const DREAM_READ_MAX = Math.max(10, Math.min(120, Number(process.env.ENKIDU_DREAM_READ_MAX || 40)));

  const idx = await loadIndex();
  const entries = idx.entries || [];

  const catalog = [];
  for (const e of entries.slice(0, DREAM_CATALOG_MAX)) {
    const rel = String(e?.path || "").replaceAll("\\", "/");
    if (!rel) continue;
    if (!rel.toLowerCase().endsWith(".md")) continue;
    catalog.push({
      path: rel,
      title: e.title || "",
      tags: e.tags || [],
      importance: Number.isFinite(Number(e.importance)) ? Number(e.importance) : 0,
      created: e.created || "",
      updated: e.updated || "",
      preview: e.preview || "",
    });
  }

  let duplicate_report = null;
  try {
    const emb = await loadEmbeddingsCache();
    if (emb && emb.items) duplicate_report = buildDuplicateReport({ entries, embeddingsCache: emb });
  } catch {
    duplicate_report = null;
  }

  const instructionFiles = [];
  for (const rel of ["instructions/work.md", "instructions/dream.md"]) {
    const abs = path.join(REPO_ROOT, rel);
    assertWithinWritableRoots(abs);
    if (!fs.existsSync(abs)) continue;
    const content = await readFileUtf8(abs);
    instructionFiles.push({ path: rel, content });
  }

  const step1 = {
    now: nowIso(),
    writable_roots: ["memories/", "instructions/"],
    note_count_total: entries.length,
    note_count_included_in_catalog: catalog.length,
    note_catalog_truncated: entries.length > catalog.length,
    catalog,
    duplicate_report,
    instructions: instructionFiles,
    output_contract: {
      want_read: ["memories/path.md", "instructions/work.md"],
      note: "one short sentence why you want these files",
    },
    constraints: {
      max_files_to_read: DREAM_READ_MAX,
      do_not_read_or_modify: ["memories/sources/verbatim/* (read-only)"],
    },
  };

  const messages1 = [
    { role: "system", content: instruction },
    {
      role: "user",
      content:
        "You are running DREAM (step 1/2).\n\n" +
        "Pick up to max_files_to_read files you need to read fully to make good edits.\n" +
        "Return ONLY valid JSON matching output_contract.\n\n" +
        JSON.stringify(step1, null, 2),
    },
  ];

  const raw1 = await openaiChat(messages1, { model: m });
  const parsed1 = safeJsonParse(raw1);
  const wantReadRaw = Array.isArray(parsed1?.want_read) ? parsed1.want_read : [];

  const wantRead = [];
  const seen = new Set();
  for (const p of wantReadRaw) {
    if (wantRead.length >= DREAM_READ_MAX) break;
    const rel = String(p || "").replaceAll("\\", "/").trim();
    if (!rel) continue;
    if (seen.has(rel)) continue;
    if (!(rel.toLowerCase().startsWith("memories/") || rel.toLowerCase().startsWith("instructions/"))) continue;
    if (rel.toLowerCase().startsWith("memories/sources/verbatim/")) continue;
    const abs = path.join(REPO_ROOT, rel);
    assertWithinWritableRoots(abs);
    try {
      assertNotProtectedWritable(abs);
    } catch {
      continue;
    }
    if (!fs.existsSync(abs)) continue;
    seen.add(rel);
    wantRead.push(rel);
  }

  const plan = {
    instruction,
    model: m,
    entriesCount: entries.length,
    catalog,
    duplicate_report,
    instructionFiles,
    wantRead,
    DREAM_READ_MAX,
  };

  return {
    plan,
    wantRead,
    note: String(parsed1?.note || "").trim(),
    summary: {
      note_count_total: entries.length,
      catalog_count: catalog.length,
      want_read_count: wantRead.length,
      duplicates: {
        exact_groups: Array.isArray(duplicate_report?.exact_same_hash) ? duplicate_report.exact_same_hash.length : 0,
        near_pairs: Array.isArray(duplicate_report?.near_duplicates) ? duplicate_report.near_duplicates.length : 0,
      },
    },
  };
}

async function dreamExecuteFromPlan(plan) {
  await ensureDirs();
  const instruction = String(plan?.instruction || "");
  const model = String(plan?.model || "").trim();
  const catalog = Array.isArray(plan?.catalog) ? plan.catalog : [];
  const duplicate_report = plan?.duplicate_report || null;
  const wantRead = Array.isArray(plan?.wantRead) ? plan.wantRead : [];

  const selected_files = [];
  for (const rel of wantRead) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const content = await readFileUtf8(abs);
    selected_files.push({ path: rel, content });
  }

  const step2 = {
    now: nowIso(),
    writable_roots: ["memories/", "instructions/"],
    note_count_total: Number(plan?.entriesCount) || 0,
    catalog,
    duplicate_report,
    selected_files,
    output_contract: {
      ops: [
        { op: "mkdir", path: "memories/someFolder" },
        { op: "write", path: "memories/path.md", content: "..." },
        { op: "move", from: "memories/a.md", to: "memories/b.md" },
        { op: "delete", path: "memories/old.md" },
      ],
      diary: "markdown string describing what you did and why",
    },
  };

  const messages2 = [
    { role: "system", content: instruction },
    {
      role: "user",
      content:
        "You are running DREAM (step 2/2).\n\n" +
        "You have a catalog of all notes (metadata+previews) and full contents for selected_files.\n" +
        "Return ONLY valid JSON matching output_contract.\n\n" +
        JSON.stringify(step2, null, 2),
    },
  ];

  let raw = await openaiChat(messages2, { model });
  let parsed = safeJsonParse(raw);
  if (!parsed) {
    // One retry with a stronger reminder if JSON is invalid.
    const retryMsgs = [
      { role: "system", content: instruction },
      {
        role: "user",
        content:
          "Your previous response was NOT valid JSON.\n\n" +
          "Return ONLY valid JSON matching output_contract.\n" +
          "It MUST include BOTH keys: ops (array) and diary (non-empty string).\n\n" +
          "Previous response (truncated):\n" +
          truncateForError(raw, 2000) +
          "\n\n" +
          JSON.stringify(step2, null, 2),
      },
    ];
    raw = await openaiChat(retryMsgs, { model });
    parsed = safeJsonParse(raw);
  }
  if (!parsed) throw new Error("Dream did not return valid JSON.");

  let ops = Array.isArray(parsed.ops) ? parsed.ops : [];
  let diary = String(parsed.diary || "").trim();

  if (!diary) {
    // One retry focused on diary only (keep it small).
    const retryDiaryMsgs = [
      { role: "system", content: instruction },
      {
        role: "user",
        content:
          "Your JSON is missing a non-empty `diary` string.\n\n" +
          "Return ONLY valid JSON with keys: ops (array) and diary (non-empty string).\n" +
          "Use the same ops unless you must adjust them for consistency.\n\n" +
          "Your previous JSON (truncated):\n" +
          truncateForError(raw, 3000),
      },
    ];
    const rawDiary = await openaiChat(retryDiaryMsgs, { model });
    const parsedDiary = safeJsonParse(rawDiary);
    if (parsedDiary) {
      ops = Array.isArray(parsedDiary.ops) ? parsedDiary.ops : ops;
      diary = String(parsedDiary.diary || "").trim();
    }
  }

  if (!diary) {
    // Final fallback: never crash the whole dream.
    diary =
      "Dream did not return a diary string. I proceeded with applying ops (if any) and recorded this fallback entry.\n\n" +
      "## Model output (truncated)\n\n" +
      "```text\n" +
      truncateForError(raw, 6000) +
      "\n```";
  }

  const applied = await applyDreamOps(ops);
  const newEntries = await buildIndex();
  await writeIndex(newEntries);

  const diaryTs = filenameTimestamp();
  const diaryPathAbs = path.join(MEMORIES_DIR, "diary", `${diaryTs}_dream.md`.toLowerCase());
  const diaryMd = [
    "---",
    `title: Dream diary (${nowIso()})`,
    `created: ${nowIso()}`,
    "tags: diary, dream",
    "source: dream",
    "---",
    "",
    diary,
    "",
    "## Applied ops",
    "",
    "```json",
    JSON.stringify(applied, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFileUtf8(diaryPathAbs, diaryMd);

  // Don't block UI on a potentially long embedding refresh; do it in the background.
  const embedScheduled = scheduleEmbedRefresh("dream");

  return {
    diaryPath: safeRelPath(diaryPathAbs),
    diary: diaryMd,
    applied,
    selected_files_count: selected_files.length,
    embedRefresh: embedScheduled ? "scheduled" : "already_running",
  };
}

async function cmdDreamSupabase(args = {}) {
  // Supabase-backed dream: only operates on memories table (instructions are read-only in hosted).
  const instruction = await readInstruction(DREAM_INSTRUCTION_FILE);
  const model = String(args.model || "").trim();

  const rows = await supabaseRest("memories", {
    method: "GET",
    query: { select: "path,title,tags,content,created_at,updated_at,importance", order: "updated_at.desc", limit: "200" },
  });

  const files = (Array.isArray(rows) ? rows : []).map((r) => ({
    path: String(r?.path || ""),
    title: r?.title,
    tags: r?.tags,
    created: r?.created_at,
    updated: r?.updated_at,
    content: r?.content,
  }));

  const instructionFiles = [];
  for (const rel of ["instructions/work.md", "instructions/dream.md"]) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    instructionFiles.push({ path: rel, content: (await readFileUtf8(abs)).trim() });
  }

  const context = {
    now: nowIso(),
    writable_roots: ["memories/"],
    note_count: files.length,
    files,
    instructions: instructionFiles,
    output_contract: {
      ops: [
        { op: "mkdir", path: "memories/someFolder" },
        { op: "write", path: "memories/path.md", content: "..." },
        { op: "move", from: "memories/a.md", to: "memories/b.md" },
        { op: "delete", path: "memories/old.md" },
      ],
      diary: "markdown string describing what you did and why",
    },
  };

  const messages = [
    { role: "system", content: instruction },
    {
      role: "user",
      content:
        "You are running DREAM.\n\n" +
        "You may only operate inside the memories/ folder.\n\n" +
        "Return ONLY valid JSON matching output_contract.\n\n" +
        JSON.stringify(context, null, 2),
    },
  ];

  const raw = await openaiChat(messages, { model });
  const parsed = safeJsonParse(raw);
  if (!parsed) throw new Error("Dream did not return valid JSON.");

  const ops = Array.isArray(parsed.ops) ? parsed.ops : [];
  const diary = String(parsed.diary || "").trim();
  if (!diary) throw new Error("Dream JSON missing diary.");

  const applied = await applyDreamOpsSupabase(ops);

  // Write diary entry as a memory row.
  const diaryTs = filenameTimestamp();
  const diaryPath = `memories/diary/${diaryTs}_dream.md`.toLowerCase();
  const diaryTitle = `Dream diary (${nowIso()})`;
  const diaryMd = [
    "---",
    `title: ${diaryTitle}`,
    `created: ${nowIso()}`,
    "tags: diary, dream",
    "source: dream",
    "---",
    "",
    diary,
    "",
    "## Applied ops",
    "",
    "```json",
    JSON.stringify(applied, null, 2),
    "```",
    "",
  ].join("\n");

  await sbUpsertMemoryRow({ path: diaryPath, content: diaryMd, title: diaryTitle, tags: ["diary", "dream"], importance: 0 });
}

function safeJsonParse(s) {
  // Allow models to accidentally wrap JSON in ``` fences.
  const text = String(s || "").trim();
  const unfenced = text.replace(/^```[a-zA-Z]*\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

async function applyDreamOps(ops) {
  // Apply ops inside writable roots (memories/ and instructions/). Validate every path.
  const applied = [];

  for (const op of ops) {
    const kind = String(op?.op || "").toLowerCase();

    if (kind === "mkdir") {
      const p = String(op?.path || "");
      const abs = path.join(REPO_ROOT, p);
      assertWithinWritableRoots(abs);
      assertNotProtectedWritable(abs);
      await fsp.mkdir(abs, { recursive: true });
      applied.push({ op: "mkdir", path: p });
      continue;
    }

    if (kind === "write") {
      const p = String(op?.path || "");
      const content = String(op?.content || "");
      const abs = path.join(REPO_ROOT, p);
      assertWithinWritableRoots(abs);
      assertNotProtectedWritable(abs);
      await writeFileUtf8(abs, content);
      applied.push({ op: "write", path: p, bytes: Buffer.byteLength(content, "utf8") });
      continue;
    }

    if (kind === "move") {
      const from = String(op?.from || "");
      const to = String(op?.to || "");
      const absFrom = path.join(REPO_ROOT, from);
      const absTo = path.join(REPO_ROOT, to);
      assertWithinWritableRoots(absFrom);
      assertWithinWritableRoots(absTo);
      assertNotProtectedWritable(absFrom);
      assertNotProtectedWritable(absTo);
      await fsp.mkdir(path.dirname(absTo), { recursive: true });
      await fsp.rename(absFrom, absTo);
      applied.push({ op: "move", from, to });
      continue;
    }

    if (kind === "delete") {
      const p = String(op?.path || "");
      const abs = path.join(REPO_ROOT, p);
      assertWithinWritableRoots(abs);
      assertNotProtectedWritable(abs);
      await fsp.rm(abs, { force: true, recursive: false });
      applied.push({ op: "delete", path: p });
      continue;
    }

    // Ignore unknown ops to keep the executor dumb and safe.
    applied.push({ op: "ignored", reason: "unknown_op", raw: op });
  }

  return applied;
}

async function applyDreamOpsSupabase(ops) {
  // Apply ops against Supabase memories table (MVP).
  const applied = [];

  for (const op of ops) {
    const kind = String(op?.op || "").toLowerCase();

    if (kind === "mkdir") {
      const p = assertSafeMemoriesRelPath(String(op?.path || ""));
      applied.push({ op: "mkdir", path: p, note: "virtual_dir" });
      continue;
    }

    if (kind === "write") {
      const p = assertSafeMemoriesRelPath(String(op?.path || ""));
      const content = String(op?.content || "");
      await sbUpsertMemoryRow({ path: p, content });
      applied.push({ op: "write", path: p, bytes: Buffer.byteLength(content, "utf8") });
      continue;
    }

    if (kind === "move") {
      const from = assertSafeMemoriesRelPath(String(op?.from || ""));
      const to = assertSafeMemoriesRelPath(String(op?.to || ""));
      await sbMoveMemory(from, to);
      applied.push({ op: "move", from, to });
      continue;
    }

    if (kind === "delete") {
      const p = assertSafeMemoriesRelPath(String(op?.path || ""));
      await sbDeleteMemoryByPath(p);
      applied.push({ op: "delete", path: p });
      continue;
    }

    applied.push({ op: "ignored", reason: "unknown_op", raw: op });
  }

  return applied;
}

async function ingestSourcesBatch(files, model, meta = {}) {
  // files: [{path, content}] from UI folder picker
  if (isSupabaseMode()) return await ingestSourcesBatchSupabase(files, model, meta);
  await ensureDirs();
  const sys = await readInstruction(SOURCES_INSTRUCTION_FILE);
  const sm = normaliseSourcesMeta(meta);

  const createdSources = [];
  const createdMemories = [];

  for (const f of files) {
    const originalPath = String(f?.path || "").trim() || "unknown.md";
    // Ignore dotfiles / dotfolders from user-selected source trees.
    const normPath = originalPath.replaceAll("\\", "/");
    const parts = normPath.split("/").filter(Boolean);
    if (parts.some((p) => p.startsWith("."))) continue;

    const content = String(f?.content || "");
    if (!content.trim()) continue;

    const sourceId = sha256Hex(content).slice(0, 12);
    const baseSlug = slugify(path.basename(normPath).replace(/\.md$/i, "")) || "source";
    const verbatimName = `${sourceId}_${baseSlug}.md`.toLowerCase();
    const verbatimRel = `memories/sources/verbatim/${verbatimName}`;
    const verbatimAbs = path.join(REPO_ROOT, verbatimRel);
    assertWithinMemories(verbatimAbs);

    // Write verbatim copy once (read-only store).
    if (!fs.existsSync(verbatimAbs)) {
      const verbatimTags = mergeTagsStrings("source, verbatim", sm.tags);
      const md = [
        "---",
        `title: ${baseSlug}`,
        `created: ${nowIso()}`,
        `tags: ${verbatimTags}`,
        "importance: 0",
        "source: sources_ingest",
        `source_id: ${sourceId}`,
        `original_path: ${normPath}`,
        sm.name ? `source_set: ${sm.name}` : "",
        sm.tags ? `source_set_tags: ${sm.tags}` : "",
        sm.context ? `source_set_context: ${sm.context}` : "",
        "---",
        "",
        content,
        "",
      ].join("\n");
      await writeFileUtf8(verbatimAbs, md);
      await updateEmbeddingForSourcePath(verbatimRel);
    }

    createdSources.push({ original_path: normPath, verbatim_path: verbatimRel });

    // Ask model to produce a curated memory note (filed like dream would).
    const userPayload = JSON.stringify(
      { original_path: normPath, source_set: sm, source_content: content.slice(0, 12000) },
      null,
      2
    );
    const messages = [
      { role: "system", content: sys },
      { role: "user", content: userPayload },
    ];
    const raw = await openaiChat(messages, { model });
    const parsed = safeJsonParse(raw);
    if (!parsed) continue;

    const modelDest = String(parsed.dest || "inbox").toLowerCase();
    const dest = sm.default_dest && sm.default_dest !== "auto" ? sm.default_dest : modelDest;
    const allowed = new Set(["inbox", "people", "projects", "howto"]);
    if (!allowed.has(dest)) continue;

    const title = String(parsed.title || baseSlug).trim() || baseSlug;
    const tags = mergeTagsStrings(String(parsed.tags || "source").trim(), sm.tags);
    const importance = Number.isFinite(Number(parsed.importance)) ? Math.max(0, Math.min(3, Number(parsed.importance))) : 1;
    const summaryMd = String(parsed.summary_md || "").trim();
    const why = String(parsed.why || "").trim();

    const created = nowIso();
    const fname = `${filenameTimestamp()}_${slugify(title).slice(0, 60)}.md`.toLowerCase();
    const memRel = `memories/${dest}/${fname}`;
    const memAbs = path.join(REPO_ROOT, memRel);
    assertWithinMemories(memAbs);

    const mem = [
      "---",
      `title: ${title}`,
      `created: ${created}`,
      `tags: ${tags}`,
      `importance: ${importance}`,
      "source: sources_ingest",
      `source_ref: ${verbatimRel}`,
      `original_path: ${normPath}`,
      sm.name ? `source_set: ${sm.name}` : "",
      sm.tags ? `source_set_tags: ${sm.tags}` : "",
      sm.context ? `source_set_context: ${sm.context}` : "",
      "---",
      "",
      summaryMd,
      "",
      why ? `Why: ${why}` : "",
      "",
    ].join("\n");

    await writeFileUtf8(memAbs, mem);

    // Update memory index + memory embedding (incremental).
    const entries = await buildIndex();
    await writeIndex(entries);
    await updateEmbeddingForMemoryPath(memRel);

    createdMemories.push({ path: memRel, title, dest, source_ref: verbatimRel });
  }

  return { createdSources, createdMemories };
}

async function ingestSourcesBatchSupabase(files, model, meta = {}) {
  // Supabase-backed sources ingest: store verbatim in `sources`, curated notes in `memories`.
  const sys = await readInstruction(SOURCES_INSTRUCTION_FILE);
  const sm = normaliseSourcesMeta(meta);
  const createdSources = [];
  const createdMemories = [];

  for (const f of files) {
    const originalPath = String(f?.path || "").trim() || "unknown.md";
    const normPath = originalPath.replaceAll("\\", "/");
    const parts = normPath.split("/").filter(Boolean);
    if (parts.some((p) => p.startsWith("."))) continue;

    const content = String(f?.content || "");
    if (!content.trim()) continue;

    const sourceId = sha256Hex(content).slice(0, 12);
    const baseSlug = slugify(path.basename(normPath).replace(/\.md$/i, "")) || "source";
    const verbatimName = `${sourceId}_${baseSlug}.md`.toLowerCase();
    const verbatimRel = `memories/sources/verbatim/${verbatimName}`;

    const verbatimTags = mergeTagsStrings("source, verbatim", sm.tags);
    const verbatimMd = [
      "---",
      `title: ${baseSlug}`,
      `created: ${nowIso()}`,
      `tags: ${verbatimTags}`,
      "importance: 0",
      "source: sources_ingest",
      `source_id: ${sourceId}`,
      `original_path: ${normPath}`,
      sm.name ? `source_set: ${sm.name}` : "",
      sm.tags ? `source_set_tags: ${sm.tags}` : "",
      sm.context ? `source_set_context: ${sm.context}` : "",
      "---",
      "",
      content,
      "",
    ].join("\n");

    await sbUpsertSourceRow({ path: verbatimRel, content: verbatimMd });
    createdSources.push({ original_path: normPath, verbatim_path: verbatimRel });

    // Ask model to produce a curated memory note (filed like dream would).
    const userPayload = JSON.stringify(
      { original_path: normPath, source_set: sm, source_content: content.slice(0, 12000) },
      null,
      2
    );
    const messages = [
      { role: "system", content: sys },
      { role: "user", content: userPayload },
    ];
    const raw = await openaiChat(messages, { model });
    const parsed = safeJsonParse(raw);
    if (!parsed) continue;

    const modelDest = String(parsed.dest || "inbox").toLowerCase();
    const dest = sm.default_dest && sm.default_dest !== "auto" ? sm.default_dest : modelDest;
    const allowed = new Set(["inbox", "people", "projects", "howto"]);
    if (!allowed.has(dest)) continue;

    const title = String(parsed.title || baseSlug).trim() || baseSlug;
    const tags = mergeTagsStrings(String(parsed.tags || "source").trim(), sm.tags);
    const importance = Number.isFinite(Number(parsed.importance)) ? Math.max(0, Math.min(3, Number(parsed.importance))) : 1;
    const summaryMd = String(parsed.summary_md || "").trim();
    const why = String(parsed.why || "").trim();

    const created = nowIso();
    const fname = `${filenameTimestamp()}_${slugify(title).slice(0, 60)}.md`.toLowerCase();
    const memRel = `memories/${dest}/${fname}`;

    const mem = [
      "---",
      `title: ${title}`,
      `created: ${created}`,
      `tags: ${tags}`,
      `importance: ${importance}`,
      "source: sources_ingest",
      `source_ref: ${verbatimRel}`,
      `original_path: ${normPath}`,
      sm.name ? `source_set: ${sm.name}` : "",
      sm.tags ? `source_set_tags: ${sm.tags}` : "",
      sm.context ? `source_set_context: ${sm.context}` : "",
      "---",
      "",
      summaryMd,
      "",
      why ? `Why: ${why}` : "",
      "",
    ].join("\n");

    await sbUpsertMemoryRow({
      path: memRel,
      content: mem,
      title,
      tags: tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
      importance,
    });

    createdMemories.push({ path: memRel, title, dest, source_ref: verbatimRel });
  }

  return { createdSources, createdMemories };
}

// -----------------------------
// Tiny UI server (Bootstrap CDN)
// -----------------------------

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseFormUrlEncoded(body) {
  const out = {};
  for (const part of String(body || "").split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    const key = decodeURIComponent(k || "");
    const val = decodeURIComponent((v || "").replace(/\+/g, " "));
    out[key] = val;
  }
  return out;
}

export async function apiHandleRequest({ method, pathname, searchParams, headers, bodyText }) {
  // Purpose: shared API handler for both the local Node server and Netlify Functions.
  const m = String(method || "GET").toUpperCase();
  const p = String(pathname || "/");

  if (m === "POST" && p === "/api/dream/plan") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const model = String(data.model || "").trim();

    pruneDreamPlanCache();
    const { plan, wantRead, note, summary } = await dreamPlanOnly({ model });
    const planToken = makeDreamPlanToken();
    DREAM_PLAN_CACHE.set(planToken, { createdAtMs: Date.now(), plan });

    return { statusCode: 200, json: { planToken, wantRead, note, summary } };
  }

  if (m === "POST" && p === "/api/dream/execute") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const planToken = String(data.planToken || "").trim();
    if (!planToken) return { statusCode: 400, json: { error: "Missing planToken" } };

    pruneDreamPlanCache();
    const hit = DREAM_PLAN_CACHE.get(planToken);
    if (!hit || !hit.plan) return { statusCode: 400, json: { error: "Unknown/expired planToken" } };

    const result = await dreamExecuteFromPlan(hit.plan);
    DREAM_PLAN_CACHE.delete(planToken);
    return { statusCode: 200, json: { ok: true, ...result } };
  }

  if (m === "POST" && p === "/api/work/plan") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const prompt = String(data.prompt || "").trim();
    const model = String(data.model || "").trim();
    const history = data.history;
    const runNow = Boolean(data.runNow);
    if (!prompt) return { statusCode: 400, json: { error: "Missing prompt" } };

    pruneWorkPlanCache();
    const plan = await workPlanCore({ prompt, model, history, runNow });
    const planToken = makeWorkPlanToken();
    WORK_PLAN_CACHE.set(planToken, { createdAtMs: Date.now(), plan });

    return {
      statusCode: 200,
      json: {
        planToken,
        usedMemories: plan.usedMemories,
        usedSources: plan.usedSources,
        route: plan.route,
        queries: plan.queries,
        fast: plan.fast,
      },
    };
  }

  if (m === "POST" && p === "/api/work/answer") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const planToken = String(data.planToken || "").trim();
    if (!planToken) return { statusCode: 400, json: { error: "Missing planToken" } };

    pruneWorkPlanCache();
    const hit = WORK_PLAN_CACHE.get(planToken);
    if (!hit || !hit.plan) return { statusCode: 400, json: { error: "Unknown/expired planToken" } };
    const plan = hit.plan;
    const { raw } = await workAnswerCore(plan);
    WORK_PLAN_CACHE.delete(planToken);
    const { answer, capture } = splitAnswerAndCapture(raw);
    const capturePath = await writeAutoCaptureToInbox(capture);
    await appendSessionEvent("user", String(plan.prompt || ""));
    await appendSessionEvent("assistant", String(answer || "").trim());
    return { statusCode: 200, json: { answer, capturePath, usedMemories: plan.usedMemories, usedSources: plan.usedSources } };
  }

  if (m === "POST" && p === "/api/work") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const prompt = String(data.prompt || "").trim();
    const model = String(data.model || "").trim();
    const history = data.history;
    const runNow = Boolean(data.runNow);
    if (!prompt) return { statusCode: 400, json: { error: "Missing prompt" } };
    const { raw, usedMemories, usedSources } = await workCore({ prompt, model, history, runNow });
    const { answer, capture } = splitAnswerAndCapture(raw);
    const capturePath = await writeAutoCaptureToInbox(capture);
    await appendSessionEvent("user", prompt);
    await appendSessionEvent("assistant", String(answer || "").trim());
    return { statusCode: 200, json: { answer, capturePath, usedMemories, usedSources } };
  }

  if (m === "POST" && p === "/api/sources/ingest") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const model = String(data.model || "").trim();
    const meta = data.meta || {};
    const files = Array.isArray(data.files) ? data.files : [];
    const out = await ingestSourcesBatch(files, model, meta);
    return { statusCode: 200, json: { ok: true, ...out } };
  }

  if (m === "POST" && p === "/api/dream") {
    const data = String(headers?.["content-type"] || "").includes("application/json")
      ? safeJsonParse(bodyText) || {}
      : parseFormUrlEncoded(bodyText);
    const model = String(data.model || "").trim();
    await cmdDream({ model });
    return { statusCode: 200, json: { ok: true } };
  }

  if (m === "GET" && p === "/api/diary/list") {
    if (isSupabaseMode()) {
      const out = await sbListDiaryFiles();
      return { statusCode: 200, json: { files: out } };
    }
    const diaryDir = path.join(MEMORIES_DIR, "diary");
    const files = fs.existsSync(diaryDir) ? await fsp.readdir(diaryDir) : [];
    const out = files
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .sort((a, b) => b.localeCompare(a))
      .map((f) => `memories/diary/${f}`);
    return { statusCode: 200, json: { files: out } };
  }

  if (m === "GET" && p === "/api/list") {
    const rel = String(searchParams?.get("path") || "memories").trim();
    if (isSupabaseMode()) {
      const out = await sbListVirtualDir(rel);
      return { statusCode: 200, json: out };
    }
    const abs = path.join(REPO_ROOT, rel);
    assertWithinMemories(abs);
    const ents = await fsp.readdir(abs, { withFileTypes: true });
    const items = ents
      .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return { statusCode: 200, json: { path: rel, items } };
  }

  if (m === "GET" && p === "/api/read") {
    const rel = String(searchParams?.get("path") || "").trim();
    if (!rel) return { statusCode: 400, json: { error: "Missing path" } };
    if (isSupabaseMode()) {
      const row = await sbGetMemoryByPath(rel);
      if (!row) return { statusCode: 404, json: { error: "Not found" } };
      return { statusCode: 200, json: { path: String(row.path || rel), content: String(row.content || "") } };
    }
    const abs = path.join(REPO_ROOT, rel);
    assertWithinMemories(abs);
    const content = await readFileUtf8(abs);
    return { statusCode: 200, json: { path: rel, content } };
  }

  return { statusCode: 404, json: { error: "Not found" } };
}

async function cmdServe(args) {
  if (String(args.watch || "").toLowerCase() === "true") {
    return await cmdServeWatch(args);
  }

  const port = Number(args.port || process.env.PORT || DEFAULT_PORT);

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url || "/", `http://localhost:${port}`);

      if (req.method === "GET" && u.pathname === "/") {
        const html = await readFileUtf8(PUBLIC_INDEX_FILE);
        return sendText(res, 200, html, "text/html; charset=utf-8");
      }

      if (req.method === "GET" && u.pathname === "/favicon.ico") {
        // Avoid noisy 404s in browser devtools.
        res.writeHead(204);
        return res.end();
      }

      if (u.pathname.startsWith("/api/")) {
        const bodyText = req.method === "POST" ? await readRequestBody(req) : "";
        const out = await apiHandleRequest({
          method: req.method,
          pathname: u.pathname,
          searchParams: u.searchParams,
          headers: req.headers,
          bodyText,
        });
        return sendJson(res, out.statusCode, out.json);
      }

      return sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      // Log full server-side error for debugging.
      console.error(err);
      return sendJson(res, 500, { error: String(err?.stack || err?.message || err) });
    }
  });

  server.listen(port, () => {
    console.log(`Enkidu UI running at http://localhost:${port}`);
  });
}

async function cmdServeWatch(args) {
  // Dev helper: restart a child server process on file changes (works on Windows without deps).
  const port = Number(args.port || process.env.PORT || DEFAULT_PORT);

  const scriptPath = path.join(REPO_ROOT, "enkidu.js");
  const watchFiles = [
    scriptPath,
    path.join(INSTRUCTIONS_DIR, "work.md"),
    path.join(INSTRUCTIONS_DIR, "dream.md"),
  ];

  let child = null;
  let debounceTimer = null;
  let restarting = false;
  const lastMtime = new Map();

  function startChild() {
    child = spawn(process.execPath, [scriptPath, "serve", "--port", String(port)], {
      stdio: "inherit",
      env: process.env,
    });
  }

  async function shouldRestartForFile(f) {
    try {
      const st = await fsp.stat(f);
      const m = Number(st.mtimeMs) || 0;
      const prev = lastMtime.get(f) ?? 0;
      if (m <= prev) return false;
      lastMtime.set(f, m);
      return true;
    } catch {
      return false;
    }
  }

  function restartChild() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (restarting) return;
      restarting = true;

      const old = child;
      child = null;
      if (old) {
        old.once("exit", () => {
          startChild();
          restarting = false;
        });
        old.kill();
      } else {
        startChild();
        restarting = false;
      }
    }, 150);
  }

  await ensureDirs();
  console.log("Watch mode: restarting server on changes to enkidu.js or instructions/*.md");

  // Seed mtimes so we don't restart from spurious watch events.
  for (const f of watchFiles) {
    try {
      const st = await fsp.stat(f);
      lastMtime.set(f, Number(st.mtimeMs) || 0);
    } catch {
      // ignore
    }
  }

  startChild();

  const watchers = [];
  for (const f of watchFiles) {
    try {
      watchers.push(
        fs.watch(f, async () => {
          if (await shouldRestartForFile(f)) restartChild();
        })
      );
    } catch {
      // Ignore missing files.
    }
  }

  process.on("SIGINT", () => {
    for (const w of watchers) w.close();
    if (child) child.kill();
    process.exit(0);
  });
}
// -----------------------------
// Main
// -----------------------------

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const cmd = String(args._[0] || "").toLowerCase();

  try {
    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      printHelp();
      return;
    }

    if (cmd === "init") return await cmdInit();
    if (cmd === "index") return await cmdIndex();
    if (cmd === "embed") return await cmdEmbed(args);
    if (cmd === "capture") return await cmdCapture(args);
    if (cmd === "work") return await cmdWork(args);
    if (cmd === "dream") return await cmdDream(args);
    if (cmd === "serve") return await cmdServe(args);

    throw new Error(`Unknown command: ${cmd}`);
  } catch (err) {
    eprint(`Error: ${String(err?.message || err)}`);
    process.exitCode = 2;
  }
}

function printHelp() {
  console.log(`Enkidu (Node.js)

Commands:
  node enkidu.js init
  node enkidu.js index
  node enkidu.js embed
  node enkidu.js capture --title \"...\" --tags \"a,b\" --text \"...\"
  node enkidu.js work \"your prompt\"
  node enkidu.js dream
  node enkidu.js serve --port 3000

Env:
  OPENAI_API_KEY (required)
  OPENAI_MODEL (optional, default: ${DEFAULT_OPENAI_MODEL})
  OPENAI_BASE_URL (optional, default: ${DEFAULT_OPENAI_BASE_URL})
  OPENAI_EMBEDDING_MODEL (optional, default: ${DEFAULT_EMBEDDING_MODEL})
`);
}

// Important: allow importing this file from Netlify Functions without running the CLI.
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isDirectRun) {
  await main();
}


