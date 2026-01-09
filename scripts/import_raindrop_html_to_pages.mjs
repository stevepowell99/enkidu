#!/usr/bin/env node
/**
 * Import a (cleaned) Raindrop HTML export into `public.pages` via the existing Netlify API.
 *
 * What it does (minimal, targeted):
 * - Finds the most recent Raindrop link row: <DT><A HREF="...">Title</A>
 * - For each following note block: <DD><blockquote ...>...</blockquote>
 *   creates ONE page with:
 *     - title: the link title
 *     - content_md: markdown containing the link + the note text
 *     - kv_tags: { source: "raindrop", spaced_repetition: 5 }
 *
 * Requirements:
 * - ENKIDU_BASE_URL (e.g. https://your-site.netlify.app or http://localhost:8888)
 * - ENKIDU_ADMIN_TOKEN (same as the UI token)
 *
 * Usage (PowerShell):
 *   node scripts/import_raindrop_html_to_pages.mjs "C:/Users/Zoom/Downloads/xxx_cleaned.html"
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LINK_RE = /<DT><A\b[^>]*HREF="([^"]+)"[^>]*>([\s\S]*?)<\/A>/i;
const NOTE_START_RE = /<DD><blockquote\b[^>]*>([\s\S]*)/i;
const NOTE_END_RE = /<\/blockquote>/i;

function decodeHtmlEntities(s) {
  // Minimal entity decoding (keeps repo dependency-free).
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const cp = Number(n);
      if (!Number.isFinite(cp)) return _m;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return _m;
      }
    });
}

function htmlToText(html) {
  // Keep it simple: preserve <br> as newlines, strip other tags.
  const withBreaks = String(html || "").replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(stripped).replace(/\r\n/g, "\n").trim();
}

async function getExistingRaindropImportIds({ baseUrl, adminToken }) {
  // Pull existing Raindrop pages (up to 2000) and build a set of their import ids.
  const url =
    `${baseUrl.replace(/\/+$/, "")}/api/pages` +
    `?limit=2000&kv_key=${encodeURIComponent("source")}&kv_value=${encodeURIComponent("raindrop")}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${adminToken}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`API error ${res.status}: ${text || res.statusText}`);

  const data = text ? JSON.parse(text) : null;
  const pages = Array.isArray(data?.pages) ? data.pages : [];

  const ids = new Set();
  for (const p of pages) {
    const id = p?.kv_tags?.raindrop_import_id;
    if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  return ids;
}

async function createRaindropPage({ baseUrl, adminToken, title, content_md, importId }) {
  const allowSecrets = String(process.env.ENKIDU_ALLOW_SECRETS || "").trim() === "1";

  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/pages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
      ...(allowSecrets ? { "x-enkidu-allow-secrets": "1" } : {}),
    },
    body: JSON.stringify({
      title,
      content_md,
      tags: [],
      kv_tags: {
        source: "raindrop",
        spaced_repetition: 5,
        raindrop_import_id: importId,
      },
      thread_id: null,
      next_page_id: null,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      `Missing input file.\n\nUsage:\n  node ${path.normalize(
        "scripts/import_raindrop_html_to_pages.mjs"
      )} "C:/path/to/raindrop_cleaned.html"`
    );
    process.exit(2);
  }

  const baseUrl = process.env.ENKIDU_BASE_URL;
  const adminToken = process.env.ENKIDU_ADMIN_TOKEN;
  if (!baseUrl) throw new Error("Missing ENKIDU_BASE_URL");
  if (!adminToken) throw new Error("Missing ENKIDU_ADMIN_TOKEN");

  const existingImportIds = await getExistingRaindropImportIds({ baseUrl, adminToken });

  const raw = fs.readFileSync(inputPath, "utf8");
  const lines = raw.split(/\r?\n/);

  let current = null; // { href, title, notes: string[] }
  let imported = 0;
  let skipped = 0;

  async function flushCurrent() {
    if (!current?.href || !current?.title) return;
    const noteText = current.notes.join("\n\n").trim();
    if (!noteText) return;

    const href = current.href;
    const title = current.title;
    const content_md = `[${title}](${href})\n\n${noteText}`;

    // Deterministic id so reruns don't create duplicates.
    const importId = crypto.createHash("sha1").update(`${href}\n---\n${noteText}`, "utf8").digest("hex");
    if (existingImportIds.has(importId)) {
      skipped += 1;
      return;
    }

    await createRaindropPage({ baseUrl, adminToken, title, content_md, importId });
    imported += 1;
    existingImportIds.add(importId);
    if (imported % 25 === 0) console.log(`Imported ${imported} pages...`);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const linkMatch = line.match(LINK_RE);
    if (linkMatch) {
      // New link starts: write the previous link's accumulated notes as ONE page.
      if (current) await flushCurrent();
      current = {
        href: linkMatch[1],
        title: decodeHtmlEntities(linkMatch[2]).trim(),
        notes: [],
      };
      continue;
    }

    const noteStart = line.match(NOTE_START_RE);
    if (!noteStart) continue;
    if (!current?.href || !current?.title) continue; // no link context yet

    // Capture until </blockquote> (may span multiple lines).
    let noteHtml = noteStart[1] ?? "";
    while (!NOTE_END_RE.test(noteHtml) && i + 1 < lines.length) {
      i += 1;
      noteHtml += "\n" + lines[i];
    }

    // Trim after </blockquote>
    const endIdx = noteHtml.search(NOTE_END_RE);
    if (endIdx >= 0) noteHtml = noteHtml.slice(0, endIdx);

    const noteText = htmlToText(noteHtml);
    if (!noteText) continue;
    current.notes.push(noteText);
  }

  // EOF: flush last link.
  if (current) await flushCurrent();

  console.log(`Done. Imported ${imported} pages. Skipped ${skipped} duplicates.`);
}

await main();


