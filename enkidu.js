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
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo locations (all relative to this file)
const REPO_ROOT = __dirname;
const MEMORIES_DIR = path.join(REPO_ROOT, "memories");
const INDEX_FILE = path.join(MEMORIES_DIR, "_index.json");
const INSTRUCTIONS_DIR = path.join(REPO_ROOT, "instructions");
const WORK_INSTRUCTION_FILE = path.join(INSTRUCTIONS_DIR, "work.md");
const DREAM_INSTRUCTION_FILE = path.join(INSTRUCTIONS_DIR, "dream.md");
const DOTENV_FILE = path.join(REPO_ROOT, ".env");

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_PORT = 3000;

const MEMORY_FOLDERS = [
  path.join(MEMORIES_DIR, "inbox"),
  path.join(MEMORIES_DIR, "people"),
  path.join(MEMORIES_DIR, "projects"),
  path.join(MEMORIES_DIR, "howto"),
  path.join(MEMORIES_DIR, "diary"),
];

function eprint(...args) {
  console.error(...args);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
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

async function ensureDirs() {
  await fsp.mkdir(MEMORIES_DIR, { recursive: true });
  await fsp.mkdir(INSTRUCTIONS_DIR, { recursive: true });
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
  // Keep generated/index files under code control.
  const resolved = path.resolve(absPath);
  const protectedPaths = [path.resolve(INDEX_FILE)];
  if (protectedPaths.includes(resolved)) throw new Error(`Protected path (not editable by dream): ${safeRelPath(resolved)}`);
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

async function retrieveTopMemories(prompt, topN) {
  const idx = await loadIndex();
  const entries = idx.entries || [];
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
    if (score > 0) scored.push([score, e, text]);
  }

  scored.sort((a, b) => {
    if (a[0] !== b[0]) return b[0] - a[0];
    return String(b[1].updated || "").localeCompare(String(a[1].updated || ""));
  });

  return scored.slice(0, topN).map(([_, e, text]) => ({ entry: e, text }));
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

  // De-dup: if an identical capture already exists in inbox, don't write it again.
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
  const fname = `${created.replace(/[-:]/g, "").replace("Z", "Z")}_${slugify(title).slice(0, 60)}.md`;
  const p = path.join(MEMORIES_DIR, "inbox", fname);
  assertWithinMemories(p);

  const md = [
    "---",
    `title: ${title}`,
    `created: ${created}`,
    `tags: ${tags.join(", ")}`,
    "source: auto_capture",
    "---",
    "",
    text,
    "",
  ].join("\n");

  await writeFileUtf8(p, md);

  const entries = await buildIndex();
  await writeIndex(entries);

  return safeRelPath(p);
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

async function workCore({ prompt, model, history }) {
  const instruction = await readInstruction(WORK_INSTRUCTION_FILE);
  const top = await retrieveTopMemories(prompt, 5);

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
  if (memChunks.length) userParts.push("Relevant memories (may be incomplete):\n\n" + memChunks.join("\n\n"));
  userParts.push("User prompt:\n\n" + prompt);

  const messages = [
    { role: "system", content: instruction },
    ...normaliseHistory(history),
    { role: "user", content: userParts.join("\n\n") },
  ];

  // First attempt
  const raw1 = await openaiChat(messages, { model });

  // If the model requests a web fetch, do ONE fetch then ask again with the fetched text.
  const url = extractWebFetchUrl(raw1);
  if (!url) return raw1;

  const webText = await fetchWebText(url);
  const messages2 = [
    { role: "system", content: instruction },
    ...normaliseHistory(history),
    {
      role: "user",
      content:
        "Web content fetched for you. Use it if helpful.\n\n" +
        `URL: ${url}\n\n` +
        "CONTENT_START\n" +
        webText +
        "\nCONTENT_END\n\n" +
        userParts.join("\n\n"),
    },
  ];

  const raw2 = await openaiChat(messages2, { model });
  const url2 = extractWebFetchUrl(raw2);
  if (url2) {
    return "I tried one web fetch already, but you requested another. Please answer using the fetched content I provided.";
  }
  return raw2;
}

async function openaiChat(messages, opts = {}) {
  loadDotenvIfPresent();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  const model = String(opts.model || "").trim() || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const url = `${baseUrl}/chat/completions`;
  const payload = { model, messages, temperature: 0.2 };

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await resp.text();
  if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}: ${raw}`);

  const data = JSON.parse(raw);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Unexpected OpenAI response: ${raw}`);
  return content;
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
  await ensureDirs();
  const title = String(args.title || "").trim();
  const text = String(args.text || "").trim();
  const tags = String(args.tags || "")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title) throw new Error("--title is required");
  if (!text) throw new Error("--text is required");

  const created = nowIso();
  const fname = `${created.replace(/[-:]/g, "").replace("Z", "Z")}_${slugify(title).slice(0, 60)}.md`;
  const p = path.join(MEMORIES_DIR, "inbox", fname);

  const md = [
    "---",
    `title: ${title}`,
    `created: ${created}`,
    `tags: ${tags.join(", ")}`,
    "source: capture",
    "---",
    "",
    text,
    "",
  ].join("\n");

  await writeFileUtf8(p, md);
  const entries = await buildIndex();
  await writeIndex(entries);
  console.log(`Captured: ${safeRelPath(p)}`);
}

async function cmdWork(args) {
  const prompt = String(args._[1] || "").trim();
  if (!prompt) throw new Error('Usage: node enkidu.js work \"your prompt\"');

  const raw = await workCore({ prompt, model: "", history: [] });
  const { answer, capture } = splitAnswerAndCapture(raw);
  await writeAutoCaptureToInbox(capture);
  process.stdout.write(String(answer).trim() + "\n");
}

async function cmdDream() {
  // Soft dream: LLM decides what to do, via editable instructions.
  // Code stays dumb: it provides context, validates ops, applies ops under memories/, writes diary entry.
  await ensureDirs();

  const instruction = await readInstruction(DREAM_INSTRUCTION_FILE);

  // Provide the model with full file contents it is allowed to operate on.
  const idx = await loadIndex();
  const entries = idx.entries || [];

  const files = [];
  for (const e of entries) {
    const rel = String(e.path || "");
    const abs = path.join(REPO_ROOT, rel);
    assertWithinMemories(abs);
    if (!fs.existsSync(abs)) continue;
    const content = await readFileUtf8(abs);
    files.push({
      path: rel,
      title: e.title,
      tags: e.tags,
      created: e.created,
      updated: e.updated,
      content,
    });
  }

  const instructionFiles = [];
  for (const rel of ["instructions/work.md", "instructions/dream.md"]) {
    const abs = path.join(REPO_ROOT, rel);
    assertWithinWritableRoots(abs);
    if (!fs.existsSync(abs)) continue;
    const content = await readFileUtf8(abs);
    instructionFiles.push({ path: rel, content });
  }

  const context = {
    now: nowIso(),
    writable_roots: ["memories/", "instructions/"],
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
        "You are running DREAM. You may only operate inside the memories/ and instructions/ folders.\n\n" +
        "Return ONLY valid JSON matching output_contract.\n\n" +
        JSON.stringify(context, null, 2),
    },
  ];

  const raw = await openaiChat(messages);
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
  const diaryTs = nowIso().replace(/[:.]/g, "").replace("Z", "Z");
  const diaryPath = path.join(MEMORIES_DIR, "diary", `${diaryTs}_dream.md`);
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

  console.log(`Dream complete. Diary: ${safeRelPath(diaryPath)}`);
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

async function cmdServe(args) {
  if (String(args.watch || "").toLowerCase() === "true") {
    return await cmdServeWatch(args);
  }

  const port = Number(args.port || process.env.PORT || DEFAULT_PORT);

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url || "/", `http://localhost:${port}`);

      if (req.method === "GET" && u.pathname === "/") {
        return sendText(res, 200, renderHtml(), "text/html; charset=utf-8");
      }

      if (req.method === "POST" && u.pathname === "/api/work") {
        const body = await readRequestBody(req);
        const data = req.headers["content-type"]?.includes("application/json")
          ? safeJsonParse(body) || {}
          : parseFormUrlEncoded(body);
        const prompt = String(data.prompt || "").trim();
        const model = String(data.model || "").trim();
        const history = data.history;
        if (!prompt) return sendJson(res, 400, { error: "Missing prompt" });
        const raw = await workCore({ prompt, model, history });
        const { answer, capture } = splitAnswerAndCapture(raw);
        const capturePath = await writeAutoCaptureToInbox(capture);
        return sendJson(res, 200, { answer, capturePath });
      }

      if (req.method === "POST" && u.pathname === "/api/capture") {
        const body = await readRequestBody(req);
        const data = req.headers["content-type"]?.includes("application/json")
          ? safeJsonParse(body) || {}
          : parseFormUrlEncoded(body);
        const title = String(data.title || "").trim();
        const tags = String(data.tags || "").trim();
        const text = String(data.text || "").trim();
        if (!title || !text) return sendJson(res, 400, { error: "Missing title or text" });
        await cmdCapture({ title, tags, text });
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "POST" && u.pathname === "/api/dream") {
        await cmdDream();
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && u.pathname === "/api/diary/list") {
        const diaryDir = path.join(MEMORIES_DIR, "diary");
        const files = fs.existsSync(diaryDir) ? await fsp.readdir(diaryDir) : [];
        const out = files
          .filter((f) => f.toLowerCase().endsWith(".md"))
          .sort((a, b) => b.localeCompare(a))
          .map((f) => `memories/diary/${f}`);
        return sendJson(res, 200, { files: out });
      }

      if (req.method === "GET" && u.pathname === "/api/list") {
        const rel = String(u.searchParams.get("path") || "memories").trim();
        const abs = path.join(REPO_ROOT, rel);
        assertWithinMemories(abs);
        const ents = await fsp.readdir(abs, { withFileTypes: true });
        const items = ents
          .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }))
          .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
        return sendJson(res, 200, { path: rel, items });
      }

      if (req.method === "GET" && u.pathname === "/api/read") {
        const rel = String(u.searchParams.get("path") || "").trim();
        if (!rel) return sendJson(res, 400, { error: "Missing path" });
        const abs = path.join(REPO_ROOT, rel);
        assertWithinMemories(abs);
        const content = await readFileUtf8(abs);
        return sendJson(res, 200, { path: rel, content });
      }

      return sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      return sendJson(res, 500, { error: String(err?.message || err) });
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

  function startChild() {
    child = spawn(process.execPath, [scriptPath, "serve", "--port", String(port)], {
      stdio: "inherit",
      env: process.env,
    });
  }

  function restartChild() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (child) child.kill();
      startChild();
    }, 150);
  }

  await ensureDirs();
  console.log("Watch mode: restarting server on changes to enkidu.js or instructions/*.md");

  startChild();

  const watchers = [];
  for (const f of watchFiles) {
    try {
      watchers.push(fs.watch(f, restartChild));
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

function renderHtml() {
  // Single-file UI. Bootstrap via CDN.
  const modelOptions = [
    { id: "", label: "(default)" },
    { id: "gpt-5.2", label: "gpt-5.2 (out: unknown)" },
    { id: "gpt-5", label: "gpt-5 (out: unknown)" },
    { id: "gpt-4.1", label: "gpt-4.1 (out: unknown)" },
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini (out: unknown)" },
    { id: "gpt-4o", label: "gpt-4o (out: unknown)" },
    { id: "gpt-4o-mini", label: "gpt-4o-mini (out: unknown)" }
  ];

  const modelOptionsHtml = modelOptions
    .map((m) => `<option value="${m.id}">${m.label}</option>`)
    .join("");

  return `<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\"/>
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>
    <title>Enkidu</title>
    <link href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css\" rel=\"stylesheet\">
    <style>
      /* Basic markdown styling inside chat bubbles */
      #chatHistory code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }
      #chatHistory pre { background: rgba(0,0,0,0.05); padding: .75rem; border-radius: .5rem; overflow-x: auto; }
      #chatHistory p:last-child { margin-bottom: 0 !important; }
      .enkidu-typingDots span { display: inline-block; width: .5rem; text-align: center; animation: enkiduDotPulse 1.2s infinite; }
      .enkidu-typingDots span:nth-child(2) { animation-delay: .15s; }
      .enkidu-typingDots span:nth-child(3) { animation-delay: .30s; }
      @keyframes enkiduDotPulse { 0%, 80%, 100% { opacity: .2; } 40% { opacity: 1; } }
    </style>
  </head>
  <body class=\"bg-light\">
    <div class=\"container py-4\">
      <div class=\"d-flex align-items-center justify-content-between mb-3\">
        <h1 class=\"h3 m-0\">Enkidu</h1>
        <div class=\"text-muted small\">Local-first UI</div>
      </div>

      <div class=\"row g-3\">
        <div class=\"col-12 col-lg-6\">
          <div class=\"card shadow-sm\">
            <div class=\"card-body\">
              <h2 class=\"h5\">Work</h2>
              <div class=\"row g-2 align-items-end mb-2\">
                <div class=\"col-12 col-sm-6\">
                  <label class=\"form-label small text-muted\" for=\"workModel\">Model</label>
                  <select id=\"workModel\" class=\"form-select\">
                    ${modelOptionsHtml}
                  </select>
                </div>
                <div class=\"col-12 col-sm-6\">
                  <label class=\"form-label small text-muted\" for=\"workModelCustom\">Custom</label>
                  <input id=\"workModelCustom\" class=\"form-control\" placeholder=\"Optional model override\"/>
                </div>
              </div>
              <div id=\"chatHistory\" class=\"border rounded bg-white p-2 mb-2\" style=\"height: 420px; overflow-y: auto;\"></div>
              <div class=\"mb-2\">
                <textarea id=\"workPrompt\" class=\"form-control\" rows=\"3\" placeholder=\"Message (Enter to send, Shift+Enter for newline)...\"></textarea>
              </div>
              <div class=\"d-flex gap-2 flex-wrap\">
                <button id=\"workBtn\" class=\"btn btn-primary\">Run</button>
                <button id=\"clearHistoryBtn\" class=\"btn btn-outline-secondary\">Start over</button>
              </div>
              <div id=\"workStatus\" class=\"mt-2 small text-muted\"></div>
            </div>
          </div>
        </div>

        <div class=\"col-12 col-lg-6\">
          <div class=\"card shadow-sm\">
            <div class=\"card-body\">
              <h2 class=\"h5\">Capture</h2>
              <div class=\"row g-2\">
                <div class=\"col-12\">
                  <input id=\"capTitle\" class=\"form-control\" placeholder=\"Title\"/>
                </div>
                <div class=\"col-12\">
                  <input id=\"capTags\" class=\"form-control\" placeholder=\"Tags (comma separated)\"/>
                </div>
                <div class=\"col-12\">
                  <textarea id=\"capText\" class=\"form-control\" rows=\"4\" placeholder=\"Memory text...\"></textarea>
                </div>
              </div>
              <button id=\"capBtn\" class=\"btn btn-secondary mt-2\">Save</button>
              <div id=\"capOut\" class=\"mt-2 small text-muted\"></div>
              <div id=\"autoCapOut\" class=\"mt-1 small text-muted\"></div>
            </div>
          </div>
        </div>

        <div class=\"col-12\">
          <div class=\"card shadow-sm\">
            <div class=\"card-body\">
              <h2 class=\"h5\">Dream + Diary</h2>
              <div class=\"d-flex gap-2 flex-wrap\">
                <button id=\"dreamBtn\" class=\"btn btn-warning\">Run Dream</button>
                <button id=\"refreshDiaryBtn\" class=\"btn btn-outline-secondary\">Refresh diary list</button>
              </div>
              <div class=\"row g-2 mt-2\">
                <div class=\"col-12 col-lg-4\">
                  <div class=\"small text-muted mb-1\">Diary entries</div>
                  <select id=\"diarySelect\" class=\"form-select\" size=\"8\"></select>
                </div>
                <div class=\"col-12 col-lg-8\">
                  <div class=\"small text-muted mb-1\">Diary content</div>
                  <pre id=\"diaryOut\" class=\"p-2 bg-body-tertiary border rounded\" style=\"white-space:pre-wrap; min-height: 12rem;\"></pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class=\"col-12\">
          <div class=\"card shadow-sm\">
            <div class=\"card-body\">
              <h2 class=\"h5\">Memories browser</h2>
              <div class=\"row g-2\">
                <div class=\"col-12 col-lg-4\">
                  <div class=\"small text-muted mb-1\">Path</div>
                  <div class=\"input-group\">
                    <input id=\"browsePath\" class=\"form-control\" value=\"memories\"/>
                    <button id=\"browseBtn\" class=\"btn btn-outline-primary\">List</button>
                  </div>
                  <ul id=\"browseList\" class=\"list-group mt-2\"></ul>
                </div>
                <div class=\"col-12 col-lg-8\">
                  <div class=\"small text-muted mb-1\">File content</div>
                  <pre id=\"fileOut\" class=\"p-2 bg-body-tertiary border rounded\" style=\"white-space:pre-wrap; min-height: 12rem;\"></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script>
      // Minimal, safe markdown renderer (escape first; render a small subset).
      function escapeHtml(s) {
        return String(s || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll(\"'\", '&#39;');
      }

      function renderMarkdown(md) {
        let s = escapeHtml(md);

        // Fenced code blocks
        const tick = String.fromCharCode(96); // avoids embedding a backtick character in the outer HTML template string
        const fence = tick + tick + tick;
        const fenceRe = new RegExp(fence + '([\\\\s\\\\S]*?)' + fence, 'g');
        s = s.replace(fenceRe, (m, code) => {
          return '<pre class=\"mb-0\"><code>' + code.replace(/^\\n|\\n$/g, '') + '</code></pre>';
        });

        // Inline code
        const inlineCodeRe = new RegExp(tick + '([^' + tick + ']*)' + tick, 'g');
        s = s.replace(inlineCodeRe, '<code>$1</code>');

        // Bold **...**
        s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

        // Italic *...*
        s = s.replace(/(^|[^*])\\*([^*]+)\\*([^*]|$)/g, '$1<em>$2</em>$3');

        // Links [text](url) - only allow http(s)
        s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (m, text, url) => {
          const u = String(url || '').trim();
          if (!/^https?:\\/\\//i.test(u)) return text;
          return '<a href=\"' + u + '\" target=\"_blank\" rel=\"noopener noreferrer\">' + text + '</a>';
        });

        // Paragraphs / line breaks (avoid touching <pre> blocks)
        const parts = s.split(/(<pre[\\s\\S]*?<\\/pre>)/g);
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].startsWith('<pre')) continue;
          parts[i] = parts[i]
            .split(/\\n\\n+/)
            .map(p => '<p class=\"mb-2\">' + p.replace(/\\n/g, '<br>') + '</p>')
            .join('');
        }
        s = parts.join('');

        return s;
      }

      async function postJson(url, obj) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
        return await r.json();
      }
      async function getJson(url) {
        const r = await fetch(url);
        return await r.json();
      }

      const workBtn = document.getElementById('workBtn');
      const workPrompt = document.getElementById('workPrompt');
      const workModel = document.getElementById('workModel');
      const workModelCustom = document.getElementById('workModelCustom');
      const clearHistoryBtn = document.getElementById('clearHistoryBtn');
      const chatHistoryEl = document.getElementById('chatHistory');
      const workStatus = document.getElementById('workStatus');

      // Persist model selection.
      const savedModel = localStorage.getItem('enkidu.workModel') || '';
      const savedCustom = localStorage.getItem('enkidu.workModelCustom') || '';
      workModel.value = savedModel;
      workModelCustom.value = savedCustom;
      workModel.onchange = () => localStorage.setItem('enkidu.workModel', workModel.value || '');
      workModelCustom.oninput = () => localStorage.setItem('enkidu.workModelCustom', workModelCustom.value || '');

      // Chat history (browser-local).
      function loadHistory() {
        try { return JSON.parse(localStorage.getItem('enkidu.chatHistory') || '[]'); } catch { return []; }
      }
      function saveHistory(h) {
        localStorage.setItem('enkidu.chatHistory', JSON.stringify(h));
      }
      function renderHistory() {
        const h = loadHistory();
        chatHistoryEl.innerHTML = '';
        for (const m of h) {
          const row = document.createElement('div');
          row.className = 'd-flex mb-2';

          const bubble = document.createElement('div');
          bubble.className = 'p-2 border rounded';
          bubble.style.whiteSpace = 'pre-wrap';
          bubble.style.maxWidth = '85%';
          bubble.innerHTML = renderMarkdown(m.content);

          if (m.role === 'user') {
            row.className += ' justify-content-end';
            bubble.className += ' bg-primary-subtle';
          } else {
            row.className += ' justify-content-start';
            bubble.className += ' bg-body-tertiary';
          }

          row.appendChild(bubble);
          chatHistoryEl.appendChild(row);
        }
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
      }

      function addTypingIndicator() {
        const row = document.createElement('div');
        row.className = 'd-flex mb-2 justify-content-start';
        row.id = 'typingIndicatorRow';

        const bubble = document.createElement('div');
        bubble.className = 'p-2 border rounded bg-body-tertiary';
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.style.maxWidth = '85%';
        bubble.innerHTML = 'Typing <span class=\"enkidu-typingDots\"><span>.</span><span>.</span><span>.</span></span>';

        row.appendChild(bubble);
        chatHistoryEl.appendChild(row);
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
      }

      function removeTypingIndicator() {
        const el = document.getElementById('typingIndicatorRow');
        if (el) el.remove();
      }

      // Enter runs Work (Shift+Enter keeps newline).
      workPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          workBtn.click();
        }
      });

      workBtn.onclick = async () => {
        workStatus.textContent = 'Working...';
        workBtn.disabled = true;
        addTypingIndicator();
        const model = (workModelCustom.value || workModel.value || '').trim();
        const history = loadHistory();
        let resp = null;
        try {
          resp = await postJson('/api/work', { prompt: workPrompt.value, model, history });
        } finally {
          removeTypingIndicator();
          workBtn.disabled = false;
        }
        workStatus.textContent = resp && resp.error ? ('Error: ' + resp.error) : '';
        if (resp.capturePath) {
          autoCapOut.textContent = 'Auto-captured to: ' + resp.capturePath;
        } else {
          autoCapOut.textContent = '';
        }

        if (resp.answer) {
          const h = loadHistory();
          h.push({ role: 'user', content: workPrompt.value });
          h.push({ role: 'assistant', content: resp.answer });
          saveHistory(h.slice(-20));
          renderHistory();
          workPrompt.value = '';
        }
      };

      clearHistoryBtn.onclick = () => {
        saveHistory([]);
        renderHistory();
        workPrompt.value = '';
        workStatus.textContent = '';
        autoCapOut.textContent = '';
      };

      const capBtn = document.getElementById('capBtn');
      const capTitle = document.getElementById('capTitle');
      const capTags = document.getElementById('capTags');
      const capText = document.getElementById('capText');
      const capOut = document.getElementById('capOut');
      const autoCapOut = document.getElementById('autoCapOut');
      capBtn.onclick = async () => {
        capOut.textContent = 'Saving...';
        const resp = await postJson('/api/capture', { title: capTitle.value, tags: capTags.value, text: capText.value });
        capOut.textContent = resp.ok ? 'Saved.' : (resp.error || 'Error');
      };

      const dreamBtn = document.getElementById('dreamBtn');
      const refreshDiaryBtn = document.getElementById('refreshDiaryBtn');
      const diarySelect = document.getElementById('diarySelect');
      const diaryOut = document.getElementById('diaryOut');

      async function refreshDiary() {
        const resp = await getJson('/api/diary/list');
        diarySelect.innerHTML = '';
        for (const f of (resp.files || [])) {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f.split('/').slice(-1)[0];
          diarySelect.appendChild(opt);
        }
        diaryOut.textContent = '';
      }

      diarySelect.onchange = async () => {
        const p = diarySelect.value;
        if (!p) return;
        const resp = await getJson('/api/read?path=' + encodeURIComponent(p));
        diaryOut.textContent = resp.content || resp.error || 'Error';
      };

      dreamBtn.onclick = async () => {
        diaryOut.textContent = 'Dreaming...';
        const resp = await postJson('/api/dream', {});
        diaryOut.textContent = resp.ok ? 'Dream complete. Refresh diary list.' : (resp.error || 'Error');
      };

      refreshDiaryBtn.onclick = refreshDiary;

      const browseBtn = document.getElementById('browseBtn');
      const browsePath = document.getElementById('browsePath');
      const browseList = document.getElementById('browseList');
      const fileOut = document.getElementById('fileOut');

      browseBtn.onclick = async () => {
        const p = browsePath.value || 'memories';
        const resp = await getJson('/api/list?path=' + encodeURIComponent(p));
        browseList.innerHTML = '';
        fileOut.textContent = '';
        if (resp.error) {
          fileOut.textContent = resp.error;
          return;
        }
        for (const it of (resp.items || [])) {
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex justify-content-between align-items-center';
          li.textContent = it.name;
          const badge = document.createElement('span');
          badge.className = 'badge text-bg-secondary';
          badge.textContent = it.type;
          li.appendChild(badge);

          li.onclick = async () => {
            const next = (p.endsWith('/') ? p.slice(0, -1) : p) + '/' + it.name;
            if (it.type === 'dir') {
              browsePath.value = next;
              browseBtn.click();
            } else {
              const r = await getJson('/api/read?path=' + encodeURIComponent(next));
              fileOut.textContent = r.content || r.error || 'Error';
            }
          };

          browseList.appendChild(li);
        }
      };

      // Initial load
      renderHistory();
      refreshDiary();
      browseBtn.click();
    </script>
  </body>
</html>`;
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
    if (cmd === "capture") return await cmdCapture(args);
    if (cmd === "work") return await cmdWork(args);
    if (cmd === "dream") return await cmdDream();
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
  node enkidu.js capture --title \"...\" --tags \"a,b\" --text \"...\"
  node enkidu.js work \"your prompt\"
  node enkidu.js dream
  node enkidu.js serve --port 3000

Env:
  OPENAI_API_KEY (required)
  OPENAI_MODEL (optional, default: ${DEFAULT_OPENAI_MODEL})
  OPENAI_BASE_URL (optional, default: ${DEFAULT_OPENAI_BASE_URL})
`);
}

await main();


