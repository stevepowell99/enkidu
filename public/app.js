// Enkidu frontend (vanilla JS).
// Purpose: minimal chat + recall UI talking to Netlify Functions.

const LS_TOKEN_KEY = "enkidu_admin_token";
const LS_ALLOW_SECRETS_KEY = "enkidu_allow_secrets";
const LS_USE_WEB_SEARCH_KEY = "enkidu_use_web_search";
const LS_LIVE_RELATED_KEY = "enkidu_live_related";
const DEFAULT_MODEL_ID = "gemini-3-flash-preview";

// Debug logging (enable per session in DevTools console):
//   sessionStorage.setItem("enkidu_debug", "1"); location.reload();
// Disable:
//   sessionStorage.removeItem("enkidu_debug"); location.reload();
const DEBUG = sessionStorage.getItem("enkidu_debug") === "1";
function dbg(...args) {
  if (!DEBUG) return;
  console.debug("[enkidu]", ...args);
}

function $(id) {
  return document.getElementById(id);
}

async function openPageById(pageId) {
  // Purpose: load a page into the Recall editor by ID (used by Recall list + chat links).
  try {
    setStatus("Loading page...", "secondary");
    const one = await apiFetch(`/api/page?id=${encodeURIComponent(String(pageId || ""))}`);
    setSelectedPage(one.page);
    setStatus("Page loaded.", "success");
  } catch (e) {
    setStatus(String(e.message || e), "danger");
  }
}

// NOTE: keep link handling simple; no special hash routing.

// -------------------------
// Clear ("X") buttons for text entry boxes
// -------------------------

function isTextEntryControl(el) {
  // Purpose: detect controls where an inline clear button makes sense.
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;

  const type = String(el.getAttribute("type") || "text").toLowerCase();
  if (["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(type)) return false;
  if (el.classList?.contains("btn-check")) return false; // Bootstrap toggle buttons
  return true; // text, password, search, email, etc.
}

function dispatchInputEvents(el) {
  // Purpose: keep existing UI wiring working (debounced recall, etc).
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function makeClearButton({ inline }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Clear");

  if (inline) {
    btn.className = "btn btn-outline-secondary btn-sm enkidu-clear-btn-inline d-none";
    btn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
  } else {
    btn.className = "btn-close enkidu-clear-btn-absolute d-none";
  }

  return btn;
}

function attachClearButton(el) {
  // Purpose: add an X to clear the control, without rewriting HTML templates everywhere.
  if (!isTextEntryControl(el)) return;
  if (el.dataset.enkiduClearApplied === "1") return;
  el.dataset.enkiduClearApplied = "1";

  const inInputGroup = !!el.closest(".input-group");
  const btn = makeClearButton({ inline: inInputGroup });

  function refresh() {
    const hasValue = !!String(el.value || "").length;
    btn.classList.toggle("d-none", !hasValue);
  }

  btn.addEventListener("click", () => {
    if (!String(el.value || "").length) return;
    el.value = "";
    dispatchInputEvents(el);
    el.focus();
    refresh();
  });

  el.addEventListener("input", refresh);
  el.addEventListener("change", refresh);

  if (inInputGroup) {
    // Input-group: add a compact button right after the control.
    el.insertAdjacentElement("afterend", btn);
    // Make sure the X is vertically aligned with textareas too.
    btn.classList.add("align-self-start");
  } else {
    // Standalone control: wrap in a positioned container and overlay the X.
    const wrap = document.createElement("div");
    wrap.className = "enkidu-clear-wrap";
    if (String(el.tagName || "").toLowerCase() === "textarea") wrap.classList.add("enkidu-clear-wrap-textarea");

    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    wrap.appendChild(btn);

    // Reserve space for the X so it doesn't cover text.
    el.classList.add("pe-5");
  }

  refresh();
}

function initClearButtons() {
  // Purpose: apply clear buttons to all current text entry boxes on the page.
  const els = Array.from(document.querySelectorAll("input, textarea"));
  for (const el of els) attachClearButton(el);
}

function refreshClearButtons() {
  // Purpose: when code programmatically changes field values, keep X visibility correct.
  for (const el of document.querySelectorAll('[data-enkidu-clear-applied="1"]')) {
    const inInputGroup = !!el.closest(".input-group");
    const btn = inInputGroup ? el.nextElementSibling : el.parentElement?.querySelector(".enkidu-clear-btn-absolute");
    if (!btn) continue;
    const hasValue = !!String(el.value || "").length;
    btn.classList.toggle("d-none", !hasValue);
  }
}

function setStatus(text, kind = "secondary") {
  const el = $("status");
  el.className = `alert alert-${kind} py-2 small mb-3`;
  el.textContent = text;
}

function getToken() {
  return localStorage.getItem(LS_TOKEN_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(LS_TOKEN_KEY, token);
}

function getAllowSecrets() {
  // Purpose: default OFF on each new browser session (do not persist across sessions).
  return sessionStorage.getItem(LS_ALLOW_SECRETS_KEY) === "1";
}

function setAllowSecrets(on) {
  sessionStorage.setItem(LS_ALLOW_SECRETS_KEY, on ? "1" : "0");
}

function getUseWebSearch() {
  // Purpose: default OFF on each new browser session (do not persist across sessions).
  return sessionStorage.getItem(LS_USE_WEB_SEARCH_KEY) === "1";
}

function setUseWebSearch(on) {
  sessionStorage.setItem(LS_USE_WEB_SEARCH_KEY, on ? "1" : "0");
}

function getLiveRelated() {
  // Purpose: default OFF on each new browser session (do not persist across sessions).
  return sessionStorage.getItem(LS_LIVE_RELATED_KEY) === "1";
}

function setLiveRelated(on) {
  sessionStorage.setItem(LS_LIVE_RELATED_KEY, on ? "1" : "0");
}

async function apiFetch(path, { method = "GET", body } = {}) {
  const token = getToken();
  const allowSecrets = getAllowSecrets();
  const res = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(allowSecrets ? { "x-enkidu-allow-secrets": "1" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = json?.error || text || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return json;
}

function setModelOptions(models) {
  const sel = $("chatModel");
  sel.innerHTML = "";

  const opts = (models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({
      name: m.name, // usually "models/<id>"
      label: m.displayName || m.name,
    }));

  if (!opts.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "(no models)";
    sel.appendChild(o);
    return;
  }

  // Prefer gemini-3 pro/flash/nano if present (per your request), otherwise show all.
  const preferred = [];
  const rest = [];
  for (const o of opts) {
    const n = String(o.name).toLowerCase();
    if (n.includes("gemini-3") && (n.includes("pro") || n.includes("flash") || n.includes("nano"))) {
      preferred.push(o);
    } else {
      rest.push(o);
    }
  }
  const ordered = preferred.length ? [...preferred, ...rest] : opts;

  for (const o of ordered) {
    const opt = document.createElement("option");
    opt.value = o.name;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }

  // Default selection: gemini-3-flash-preview if present, else first option.
  const match = ordered.find((o) => String(o.name).endsWith(`/${DEFAULT_MODEL_ID}`) || String(o.name) === DEFAULT_MODEL_ID);
  if (match) sel.value = match.name;
}

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// -------------------------
// Related pages (client-side similarity)
// -------------------------

let recentPagesCache = null; // loaded lazily (array of pages)
let relatedDebounce = null;
const selectedPayloadIds = new Set(); // pages selected to include in next chat request
let relatedRequestSeq = 0; // increments per related recompute (used to ignore stale async results)
let kvTagStats = null; // computed from recent pages: key -> { topValue, counts(Map) }

// -------------------------
// Wikilinks (Obsidian-style [[Title]])
// -------------------------

let wikilinkPicker = null; // { open, targetId, startIdx, activeIdx, items }

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function preprocessWikilinks(md) {
  // Purpose: turn [[Title]] into clickable HTML links before feeding to marked.
  const s = String(md || "");
  return s.replace(/\[\[([^\]\n]{1,200})\]\]/g, (_m, inner) => {
    const raw = String(inner || "").trim();
    if (!raw) return _m;
    const parts = raw.split("|");
    const title = (parts[0] || "").trim();
    const label = (parts[1] || title).trim();
    if (!title) return _m;
    return `<a href="#" class="enkidu-wikilink" data-wikilink-title="${escapeHtml(title)}">${escapeHtml(
      label
    )}</a>`;
  });
}

function extractWikilinkTitles(text) {
  // Purpose: parse [[Title]] and [[Title|Label]] from raw text.
  const s = String(text || "");
  const out = [];
  const re = /\[\[([^\]\n]{1,200})\]\]/g;
  let m;
  while ((m = re.exec(s))) {
    const inner = String(m[1] || "").trim();
    if (!inner) continue;
    const title = String(inner.split("|")[0] || "").trim();
    if (!title) continue;
    out.push(title);
  }
  // Unique (preserve order).
  const seen = new Set();
  const uniq = [];
  for (const t of out) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(t);
  }
  return uniq;
}

function findOpenWikilink(value, caretIdx) {
  // Purpose: find the active `[[...` segment before the caret that does not have a closing `]]` yet.
  const upToCaret = value.slice(0, caretIdx);
  const start = upToCaret.lastIndexOf("[[");
  if (start < 0) return null;
  const after = upToCaret.slice(start + 2);
  if (after.includes("]]")) return null;
  return { startIdx: start, query: after };
}

function fuzzyScore(query, text) {
  // Purpose: minimal fuzzy match. Prefer substring; else prefer in-order character hits.
  const q = String(query || "").toLowerCase().trim();
  const t = String(text || "").toLowerCase();
  if (!q) return 1;
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx;
  let qi = 0;
  let score = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 5;
      qi++;
    } else if (q.includes(t[i])) {
      score += 1;
    }
  }
  return qi === q.length ? score : 0;
}

function positionPickerNearEl(el) {
  const picker = $("wikilinkPicker");
  if (!picker) return;
  const r = el.getBoundingClientRect();
  const w = picker.offsetWidth || 420;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
  const top = Math.min(window.innerHeight - 8, r.bottom + 6);
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

function closeWikilinkPicker() {
  wikilinkPicker = null;
  const picker = $("wikilinkPicker");
  if (picker) picker.style.display = "none";
}

async function openOrUpdateWikilinkPicker(targetEl) {
  const el = targetEl;
  if (!el) return;
  const caret = el.selectionStart ?? 0;
  const value = String(el.value || "");

  const hit = findOpenWikilink(value, caret);
  if (!hit) return closeWikilinkPicker();

  const pages = await ensureRecentPagesCache();
  const titled = (pages || []).filter((p) => (p?.title || "").trim());

  const scored = titled
    .map((p) => ({
      p,
      score: fuzzyScore(hit.query, p.title),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((x) => x.p);

  wikilinkPicker = {
    open: true,
    targetId: el.id,
    startIdx: hit.startIdx,
    activeIdx: 0,
    items: scored,
  };

  const picker = $("wikilinkPicker");
  const list = $("wikilinkPickerList");
  const qEl = $("wikilinkPickerQuery");
  if (!picker || !list || !qEl) return;

  qEl.textContent = `[[${hit.query}`;
  list.innerHTML = "";

  for (let i = 0; i < scored.length; i++) {
    const p = scored[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `list-group-item list-group-item-action py-1 ${i === 0 ? "active" : ""}`;
    const when = p.created_at ? new Date(p.created_at).toLocaleDateString() : "";
    btn.innerHTML = `<div class="d-flex justify-content-between gap-2">
      <div class="text-truncate">${escapeHtml(p.title)}</div>
      <div class="small text-secondary flex-shrink-0">${escapeHtml(when)}</div>
    </div>`;
    btn.onclick = () => insertWikilinkSelection(i);
    list.appendChild(btn);
  }

  picker.style.display = "block";
  positionPickerNearEl(el);
}

function highlightPickerIndex(idx) {
  const list = $("wikilinkPickerList");
  if (!list) return;
  const items = Array.from(list.querySelectorAll(".list-group-item"));
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle("active", i === idx);
  }
}

function insertWikilinkSelection(idx) {
  if (!wikilinkPicker?.open) return;
  const el = $(wikilinkPicker.targetId);
  if (!el) return closeWikilinkPicker();
  const items = wikilinkPicker.items || [];
  const picked = items[idx];
  if (!picked) return closeWikilinkPicker();

  const caret = el.selectionStart ?? 0;
  const value = String(el.value || "");
  const startIdx = wikilinkPicker.startIdx;
  const title = String(picked.title || "").trim();
  if (!title) return closeWikilinkPicker();

  const needsClose = value.slice(caret, caret + 2) !== "]]";
  const insert = `[[${title}${needsClose ? "]]" : ""}`;

  const before = value.slice(0, startIdx);
  const after = value.slice(caret);
  el.value = `${before}${insert}${after}`;
  const newCaret = (before + insert).length;
  el.focus();
  el.setSelectionRange(newCaret, newCaret);
  closeWikilinkPicker();

  // Keep preview synced if we inserted into the page editor.
  if (el.id === "pageContent") renderPreview();
}

function handleWikilinkKeydown(e) {
  if (!wikilinkPicker?.open) return;
  if (wikilinkPicker.targetId !== e.target?.id) return;
  const items = wikilinkPicker.items || [];
  if (!items.length) return;

  if (e.key === "Escape") {
    e.preventDefault();
    closeWikilinkPicker();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    wikilinkPicker.activeIdx = Math.min(items.length - 1, (wikilinkPicker.activeIdx || 0) + 1);
    highlightPickerIndex(wikilinkPicker.activeIdx);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    wikilinkPicker.activeIdx = Math.max(0, (wikilinkPicker.activeIdx || 0) - 1);
    highlightPickerIndex(wikilinkPicker.activeIdx);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    insertWikilinkSelection(wikilinkPicker.activeIdx || 0);
    return;
  }
}

function getRelatedMatchers() {
  // Purpose: read the Related matchers (multi-select). Default is all ON (= old "mixed").
  return {
    time: !!$("matchTime")?.checked,
    text: !!$("matchText")?.checked,
    title: !!$("matchTitle")?.checked,
    embeddings: !!$("matchEmbeddings")?.checked,
  };
}

function isRecallSearchActive() {
  // Purpose: if any recall search field is non-empty, we are in "search" mode (not "related").
  const tag = ($("recallTag")?.value || "").trim();
  const kvKey = ($("recallKvKey")?.value || "").trim();
  const kvValue = ($("recallKvValue")?.value || "").trim();
  return !!(tag || kvKey || kvValue);
}

function getVisibleRecallIds() {
  // Purpose: read the currently visible Related/Recall list (checkboxes).
  const root = $("recallResults");
  if (!root) return [];
  return Array.from(root.querySelectorAll('input[type="checkbox"][data-page-id]'))
    .map((el) => el.dataset.pageId)
    .filter(Boolean);
}

function updateRelatedToggleLabel() {
  // Purpose: keep the Select/Unselect All toggle in sync with the visible list + selected state.
  const btn = $("toggleRelatedAll");
  if (!btn) return;
  const ids = getVisibleRecallIds();
  btn.disabled = ids.length === 0;
  const allSelected = ids.length > 0 && ids.every((id) => selectedPayloadIds.has(id));
  btn.textContent = allSelected ? "Unselect all" : "Select all";
}

function updateTagSuggestionsFromPages(pages, { limit = 15 } = {}) {
  // Purpose: suggest common tags in the Tag filter box.
  const dl = $("tagSuggestions");
  if (!dl) return;

  const counts = new Map(); // tag -> count
  for (const p of pages || []) {
    for (const t of p?.tags || []) {
      const tag = String(t).trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);

  dl.innerHTML = "";
  for (const tag of top) {
    const opt = document.createElement("option");
    opt.value = tag;
    dl.appendChild(opt);
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length >= 3);
}

function scoreOverlap(queryTokens, pageText) {
  if (!queryTokens.length) return 0;
  const pageTokens = new Set(tokenize(pageText));
  let hit = 0;
  for (const t of queryTokens) if (pageTokens.has(t)) hit++;
  return hit;
}

function updateKvKeySuggestionsFromPages(pages, { limit = 20 } = {}) {
  // Purpose: suggest common KV keys in the KV key filter box + compute key->topValue stats.
  const dl = $("kvKeySuggestions");
  if (!dl) return;

  const keyCounts = new Map(); // key -> count
  const perKeyValueCounts = new Map(); // key -> Map(value -> count)

  for (const p of pages || []) {
    const kv = p?.kv_tags;
    if (!kv || typeof kv !== "object" || Array.isArray(kv)) continue;
    for (const [k, v] of Object.entries(kv)) {
      const key = String(k).trim();
      if (!key) continue;
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);

      const value = String(v ?? "").trim();
      if (!perKeyValueCounts.has(key)) perKeyValueCounts.set(key, new Map());
      const m = perKeyValueCounts.get(key);
      m.set(value, (m.get(value) || 0) + 1);
    }
  }

  // Build stats: choose most common value for each key.
  kvTagStats = new Map();
  for (const [key, m] of perKeyValueCounts.entries()) {
    let topValue = "";
    let topCount = -1;
    for (const [value, c] of m.entries()) {
      if (c > topCount) {
        topCount = c;
        topValue = value;
      }
    }
    kvTagStats.set(key, { topValue, counts: m });
  }

  const topKeys = Array.from(keyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

  dl.innerHTML = "";
  for (const key of topKeys) {
    const opt = document.createElement("option");
    opt.value = key;
    dl.appendChild(opt);
  }
}

async function ensureRecentPagesCache() {
  if (recentPagesCache) return recentPagesCache;
  // Load a larger window so wikilink/title pickers can see "any page" in normal use.
  const data = await apiFetch(`/api/pages?limit=2000`);
  recentPagesCache = data.pages || [];
  updateTagSuggestionsFromPages(recentPagesCache);
  updateKvKeySuggestionsFromPages(recentPagesCache);
  return recentPagesCache;
}

async function openPageById(pageId) {
  // Purpose: centralise "open this page in the editor" for wikilinks and list clicks.
  setStatus("Loading page...", "secondary");
  const one = await apiFetch(`/api/page?id=${encodeURIComponent(pageId)}`);
  setSelectedPage(one.page);
  setStatus("Page loaded.", "success");
}

async function openPageByTitle(title) {
  // Purpose: resolve a wikilink title to a page (most recent wins if duplicates).
  const pages = await ensureRecentPagesCache();
  const want = String(title || "").trim().toLowerCase();
  if (!want) throw new Error("Missing wikilink title");

  const matches = (pages || []).filter((p) => String(p?.title || "").trim().toLowerCase() === want);
  if (!matches.length) throw new Error(`No page titled: ${title}`);

  matches.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  if (matches.length > 1) {
    setStatus(`Multiple pages titled "${title}" — opening the most recent.`, "warning");
  }
  await openPageById(matches[0].id);
}

async function resolveTitleToPageId(title) {
  // Purpose: resolve a title to a page ID (most recent wins). Used for auto-payload on chat send.
  const pages = await ensureRecentPagesCache();
  const want = String(title || "").trim().toLowerCase();
  if (!want) return null;
  const matches = (pages || []).filter((p) => String(p?.title || "").trim().toLowerCase() === want);
  if (!matches.length) return null;
  matches.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return matches[0]?.id || null;
}

function updatePayloadCount() {
  $("payloadCount").textContent = `Payload: ${selectedPayloadIds.size}`;
}

// -------------------------
// Recall panel
// -------------------------

let selectedPageId = null;
let isEditingMarkdown = false; // merged markdown+preview: preview by default when non-empty

function renderPreview() {
  const md = $("pageContent").value || "";
  $("pagePreview").innerHTML = window.marked ? window.marked.parse(preprocessWikilinks(md)) : md;
}

function syncMarkdownWidget() {
  // Purpose: merge editor + preview. If non-empty and not editing => show preview; else show editor.
  const md = $("pageContent").value || "";
  const hasMd = !!md.trim();

  if (!isEditingMarkdown && hasMd) {
    renderPreview();
    $("pageContent").style.display = "none";
    $("pagePreview").style.display = "block";
  } else {
    // Show editor (empty pages start here; double-click switches here).
    $("pageContent").style.display = "block";
    $("pagePreview").style.display = "none";
  }
}

function setSelectedPage(page) {
  selectedPageId = page?.id || null;
  $("pageId").textContent = selectedPageId || "(none)";
  $("pageTitle").value = page?.title || "";
  $("pageTags").value = (page?.tags || []).join(", ");
  $("pageKvTags").value = JSON.stringify(page?.kv_tags || {}, null, 2);
  $("pageContent").value = page?.content_md || "";
  isEditingMarkdown = false;
  syncMarkdownWidget();
  refreshClearButtons();
}

function renderRecallResults(pages) {
  const root = $("recallResults");
  root.innerHTML = "";

  // Purpose: compute per-list normalization so we can show a right-border intensity scale.
  const embDistances = (pages || [])
    .filter((p) => p?._enkidu_rel?.kind === "embeddings")
    .map((p) => Number(p?._enkidu_rel?.distance))
    .filter((d) => Number.isFinite(d));
  const embMin = embDistances.length ? Math.min(...embDistances) : null;
  const embMax = embDistances.length ? Math.max(...embDistances) : null;

  const heurScores = (pages || [])
    .filter((p) => p?._enkidu_rel?.kind === "heuristic")
    .map((p) => Number(p?._enkidu_rel?.score))
    .filter((s) => Number.isFinite(s));
  const heurMin = heurScores.length ? Math.min(...heurScores) : null;
  const heurMax = heurScores.length ? Math.max(...heurScores) : null;

  function clamp01(x) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  function relatedStrength01(p) {
    const rel = p?._enkidu_rel;
    if (rel?.kind === "embeddings" && embMin != null && embMax != null) {
      const d = Number(rel.distance);
      if (!Number.isFinite(d)) return 0;
      const denom = embMax - embMin || 1;
      // Lower distance => stronger.
      return clamp01(1 - (d - embMin) / denom);
    }
    if (rel?.kind === "heuristic" && heurMin != null && heurMax != null) {
      const s = Number(rel.score);
      if (!Number.isFinite(s)) return 0;
      const denom = heurMax - heurMin || 1;
      // Higher score => stronger.
      return clamp01((s - heurMin) / denom);
    }
    return 0;
  }

  dbg("renderRecallResults", { count: (pages || []).length });
  for (const p of pages || []) {
    const row = document.createElement("div");
    row.className = "enkidu-result-row mb-1";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.pageId = p.id;
    cb.checked = selectedPayloadIds.has(p.id);
    cb.onchange = () => {
      if (cb.checked) selectedPayloadIds.add(p.id);
      else selectedPayloadIds.delete(p.id);
      updatePayloadCount();
      updateRelatedToggleLabel();
    };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-light w-100 text-start";

    const title = p.title || (p.content_md || "").slice(0, 80) || "(untitled)";
    const when = p.created_at ? new Date(p.created_at).toLocaleString() : "";
    btn.textContent = `${title} — ${when}`;
    const strength = relatedStrength01(p);
    btn.style.borderRightWidth = "6px";
    btn.style.borderRightStyle = "solid";
    if (strength > 0) {
      const a = 0.15 + 0.85 * strength; // stronger => more intense
      btn.style.borderRightColor = `rgba(25, 135, 84, ${a.toFixed(3)})`; // Bootstrap "success" green
    } else {
      btn.style.borderRightColor = "rgba(108, 117, 125, 0.18)"; // Bootstrap "secondary" gray
    }
    btn.onclick = () => openPageById(p.id);

    row.appendChild(cb);
    row.appendChild(btn);
    root.appendChild(row);
  }

  updateRelatedToggleLabel();
}

async function recallSearch() {
  const tag = ($("recallTag").value || "").trim();
  const kvKey = ($("recallKvKey")?.value || "").trim();
  const kvValue = ($("recallKvValue")?.value || "").trim();
  const draft = ($("chatInput")?.value || "").trim();
  const matchers0 = getRelatedMatchers();
  dbg("recallSearch:start", {
    mode: tag || kvKey || kvValue ? "search" : "related",
    draftLen: draft.length,
    tag,
    kvKey,
    kvValue,
    matchers: matchers0,
  });

  // If user typed tag/KV filters, use server search (optional substring q from chat draft).
  if (tag || kvKey || kvValue) {
    if ((kvKey && !kvValue) || (!kvKey && kvValue)) {
      throw new Error("KV filter requires both key and value");
    }
    setStatus("Searching...", "secondary");
    const chatQ = ($("chatInput")?.value || "").trim();
    const params = [];
    params.push("limit=50");
    if (chatQ) params.push(`q=${encodeURIComponent(chatQ)}`);
    if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
    if (kvKey) params.push(`kv_key=${encodeURIComponent(kvKey)}`);
    if (kvValue) params.push(`kv_value=${encodeURIComponent(kvValue)}`);
    dbg("recallSearch:serverSearch", { params });
    const data = await apiFetch(`/api/pages?${params.join("&")}`);
    renderRecallResults(data.pages);
    setStatus(`Found ${data.pages?.length || 0} pages.`, "success");
    dbg("recallSearch:serverSearch:done", { count: data.pages?.length || 0 });
    return;
  }

  // Otherwise: "related pages" mode based on current chatbox text.
  const chatText = ($("chatInput").value || "").trim();
  const matchers = getRelatedMatchers();
  const requestSeq = ++relatedRequestSeq;
  dbg("recallSearch:related", { requestSeq, chatTextLen: chatText.length, matchers });

  setStatus("Loading related pages...", "secondary");

  // If there is no chat text yet, just show recent assistant chat pages.
  if (!chatText) {
    const pages = await ensureRecentPagesCache();
    const candidates = pages.filter(
      (p) => (p?.kv_tags?.role === "assistant" || p?.kv_tags?.role === "user") && (p?.tags || []).includes("chat")
    );
    const recent = candidates.slice(0, 50);
    renderRecallResults(recent);
    setStatus(`Related: showing ${recent.length} recent answers.`, "success");
    dbg("recallSearch:related:emptyDraft", { requestSeq, recent: recent.length });
    return;
  }

  async function loadEmbeddingsRelated(limit = 50) {
    // Purpose: server-side semantic similarity using pgvector.
    dbg("embeddings:start", { requestSeq, limit, chatTextLen: chatText.length });
    const data = await apiFetch(
      `/api/pages?limit=${encodeURIComponent(limit)}&related_to=${encodeURIComponent(chatText)}`
    );
    dbg("embeddings:done", {
      requestSeq,
      count: data.pages?.length || 0,
      head: (data.pages || []).slice(0, 5).map((p) => ({
        id: p?.id,
        distance: p?.distance,
        len: (p?.content_md || "").length,
        title: p?.title || "",
      })),
    });
    return (data.pages || []).map((p) => ({
      ...p,
      _enkidu_rel: { kind: "embeddings", distance: p?.distance },
    }));
  }

  const queryTokens = tokenize(chatText).slice(0, 40);
  const pages = await ensureRecentPagesCache();

  // Candidate set:
  // - By default, keep this focused on chat history (so Related behaves like "similar past chats").
  // - If Title matching is enabled, widen to *all* pages (so you can match titles of notes/base pages),
  //   but still skip prompt cards that are operational.
  const candidates = matchers.title
    ? pages.filter((p) => {
        const tags = p?.tags || [];
        if (tags.includes("dream-prompt")) return false;
        if (tags.includes("split-prompt")) return false;
        return true;
      })
    : pages.filter(
        (p) => (p?.kv_tags?.role === "assistant" || p?.kv_tags?.role === "user") && (p?.tags || []).includes("chat")
      );
  dbg("recallSearch:candidates", {
    requestSeq,
    candidates: candidates.length,
    queryTokens: queryTokens.length,
    scope: matchers.title ? "all-pages" : "chat-only",
  });

  function recencyScore(createdAt) {
    const ts = createdAt ? new Date(createdAt).getTime() : 0;
    return ts;
  }

  const useHeuristic = matchers.time || matchers.text || matchers.title;
  const scored = useHeuristic
    ? candidates
        .map((p) => {
          const textScore = scoreOverlap(queryTokens, p.content_md || "");
          const titleScore = scoreOverlap(queryTokens, p.title || "");
          const timeScore = recencyScore(p.created_at);

          // Simple weighted mix: title overlap is stronger signal than body overlap.
          const score =
            (matchers.text ? textScore * 3 : 0) +
            (matchers.title ? titleScore * 6 : 0) +
            (matchers.time ? timeScore / 1e12 : 0);

          return { p, score, textScore, titleScore };
        })
        // If any lexical matcher is enabled (text/title), require at least one hit; otherwise time-only would include everything.
        .filter((x) => {
          const needLex = matchers.text || matchers.title;
          if (!needLex) return true;
          return (matchers.text && x.textScore > 0) || (matchers.title && x.titleScore > 0);
        })
        .sort((a, b) => b.score - a.score)
    : [];

  const topHeuristic = useHeuristic
    ? scored.slice(0, 50).map((x) => ({
        ...x.p,
        _enkidu_rel: { kind: "heuristic", score: x.score, textScore: x.textScore },
      }))
    : [];
  dbg("recallSearch:heuristic", { requestSeq, useHeuristic, topHeuristic: topHeuristic.length });

  // If embeddings are OFF: just show heuristic (which may be empty).
  if (!matchers.embeddings) {
    renderRecallResults(topHeuristic);
    setStatus(`Related: showing ${topHeuristic.length} pages.`, "success");
    dbg("recallSearch:final", { requestSeq, mode: "heuristic-only", count: topHeuristic.length });
    return;
  }

  // Embeddings are ON. If we also have heuristic matchers ON, show heuristic immediately, then merge in embeddings.
  const haveHeuristic = topHeuristic.length > 0;
  if (haveHeuristic) {
    renderRecallResults(topHeuristic);
    setStatus(`Related: showing ${topHeuristic.length} pages (loading embeddings).`, "secondary");
  }

  try {
    const emb = await loadEmbeddingsRelated(haveHeuristic ? 25 : 50);
    if (requestSeq !== relatedRequestSeq) return; // stale (user typed again)
    const embIds = new Set(emb.map((p) => p.id));
    const merged = haveHeuristic ? [...emb, ...topHeuristic.filter((p) => !embIds.has(p.id))].slice(0, 50) : emb;
    renderRecallResults(merged);
    setStatus(`Related: showing ${merged.length} pages.`, "success");
    dbg("recallSearch:final", {
      requestSeq,
      mode: haveHeuristic ? "embeddings+heuristic" : "embeddings-only",
      merged: merged.length,
      emb: emb.length,
      heuristic: topHeuristic.length,
    });
  } catch (e) {
    if (requestSeq !== relatedRequestSeq) return;
    setStatus(String(e.message || e), "danger");
    dbg("recallSearch:error", { requestSeq, error: String(e?.message || e) });
  }
}

async function savePage() {
  let kv_tags = {};
  try {
    const raw = ($("pageKvTags").value || "").trim();
    kv_tags = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("KV tags must be valid JSON");
  }
  if (!kv_tags || typeof kv_tags !== "object" || Array.isArray(kv_tags)) {
    throw new Error("KV tags must be a JSON object");
  }

  const payload = {
    title: $("pageTitle").value || null,
    tags: parseTags($("pageTags").value),
    content_md: $("pageContent").value || "",
    kv_tags,
  };

  setStatus("Saving...", "secondary");

  if (!selectedPageId) {
    const data = await apiFetch("/api/pages", { method: "POST", body: payload });
    setSelectedPage(data.page);
    setStatus("Created.", "success");
    await recallSearch();
    return;
  }

  const data = await apiFetch(`/api/page?id=${encodeURIComponent(selectedPageId)}`, {
    method: "PUT",
    body: payload,
  });
  setSelectedPage(data.page);
  setStatus("Saved.", "success");
  await recallSearch();
}

async function deletePage() {
  // Purpose: delete the currently selected page AND any pages checked in Related/Recall.
  const ids = new Set();
  if (selectedPageId) ids.add(selectedPageId);
  for (const id of selectedPayloadIds) ids.add(id);
  if (!ids.size) return;

  const msg = ids.size === 1 ? "Delete this page?" : `Delete these ${ids.size} pages?`;
  if (!confirm(msg)) return;

  setStatus("Deleting...", "secondary");

  // NOTE: backend only supports deleting one page per request; keep it simple and sequential.
  for (const id of ids) {
    await apiFetch(`/api/page?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    selectedPayloadIds.delete(id); // keep payload selection consistent with reality
  }

  updatePayloadCount();
  setSelectedPage(null);
  recentPagesCache = null; // drop client cache so "Related" doesn't show deleted pages
  setStatus("Deleted.", "success");
  await recallSearch();
}

// -------------------------
// Chat panel
// -------------------------

function renderChatLog(pages) {
  const root = $("chatLog");
  root.innerHTML = "";

  const ordered = (pages || []).slice().reverse();
  for (const p of ordered) {
    const role = p?.kv_tags?.role || "user";
    const div = document.createElement("div");
    div.className = `enkidu-msg ${role === "assistant" ? "enkidu-msg-assistant" : "enkidu-msg-user"}`;

    const head = document.createElement("div");
    head.className = "small text-secondary mb-1";
    head.textContent = `${role} — ${p.created_at ? new Date(p.created_at).toLocaleString() : ""}`;

    const body = document.createElement("div");
    // Purpose: assistant replies are Markdown; render as HTML for readability.
    // NOTE: this renders HTML produced by `marked` (treat assistant content as untrusted).
    if (role === "assistant" && window.marked)
      body.innerHTML = window.marked.parse(preprocessWikilinks(p.content_md || ""));
    else body.textContent = p.content_md || "";

    div.appendChild(head);
    div.appendChild(body);

    root.appendChild(div);
  }

  root.scrollTop = root.scrollHeight;
}

async function reloadThread() {
  const threadId = ($("threadSelect").value || "").trim();
  if (!threadId) {
    setStatus("Select a thread (or start chatting to create one).", "secondary");
    return;
  }

  setStatus("Loading thread...", "secondary");
  const data = await apiFetch(`/api/pages?limit=100&thread_id=${encodeURIComponent(threadId)}&tag=chat`);
  renderChatLog(data.pages);
  setStatus(`Loaded ${data.pages?.length || 0} messages.`, "success");
}

async function sendChat() {
  const msg = $("chatInput").value || "";
  const threadId = ($("threadSelect").value || "").trim();
  if (!msg.trim()) return;

  // Auto-payload: if draft contains [[wikilinks]], include those pages as context payload.
  const linkTitles = extractWikilinkTitles(msg);
  if (linkTitles.length) {
    for (const t of linkTitles) {
      const id = await resolveTitleToPageId(t);
      if (id) selectedPayloadIds.add(id);
    }
    updatePayloadCount();
    updateRelatedToggleLabel();
  }

  $("chatInput").value = "";
  refreshClearButtons();
  setStatus("Sending...", "secondary");

  const model = $("chatModel").value || null;
  const use_web_search = !!$("useWebSearch")?.checked;
  const context_page_ids = Array.from(selectedPayloadIds);
  const data = await apiFetch("/api/chat", {
    method: "POST",
    body: { message: msg, thread_id: threadId || null, model, context_page_ids, use_web_search },
  });

  // If the assistant created split pages, backfill embeddings in a separate call
  // so chat doesn’t block on N embedding requests (avoids Netlify dev 30s timeout).
  if (Array.isArray(data?.created_pages) && data.created_pages.length) {
    apiFetch("/api/backfill-embeddings?limit=200", {
      method: "POST",
      body: { ids: data.created_pages },
    }).catch(() => {});
  }

  await loadThreads(data.thread_id);
  await reloadThread();
  setStatus("Replied.", "success");
}

function newThread() {
  $("threadSelect").value = "";
  $("chatLog").innerHTML = "";
  setStatus("New thread. Send a message to create it.", "secondary");
}

// -------------------------
// Init wiring
// -------------------------

function init() {
  initClearButtons();
  $("adminToken").value = getToken();
  refreshClearButtons();
  updatePayloadCount();
  if ($("allowSecrets")) $("allowSecrets").checked = getAllowSecrets();
  if ($("useWebSearch")) $("useWebSearch").checked = getUseWebSearch();
  if ($("liveRelated")) $("liveRelated").checked = getLiveRelated();
  dbg("init", {
    allowSecrets: getAllowSecrets(),
    useWebSearch: getUseWebSearch(),
    matchers: getRelatedMatchers(),
  });

  $("saveToken").onclick = () => {
    setToken(($("adminToken").value || "").trim());
    setStatus("Token saved. Try search or chat.", "success");
    loadModels().catch(() => {});
    loadThreads().catch(() => {});
    ensureRecentPagesCache().catch(() => {});
  };
  $("allowSecrets")?.addEventListener("change", () => {
    setAllowSecrets(!!$("allowSecrets").checked);
  });
  $("useWebSearch")?.addEventListener("change", () => {
    setUseWebSearch(!!$("useWebSearch").checked);
  });
  $("liveRelated")?.addEventListener("change", () => {
    setLiveRelated(!!$("liveRelated").checked);
    // If turning on, refresh immediately (then typing will keep it updated).
    if ($("liveRelated").checked && !isRecallSearchActive()) {
      recallSearch().catch(() => {});
    }
  });
  $("toggleRelatedAll")?.addEventListener("click", () => {
    const ids = getVisibleRecallIds();
    if (!ids.length) return;
    const allSelected = ids.every((id) => selectedPayloadIds.has(id));
    for (const id of ids) {
      if (allSelected) selectedPayloadIds.delete(id);
      else selectedPayloadIds.add(id);
    }
    // Update the visible checkboxes immediately (no re-search).
    const root = $("recallResults");
    for (const cb of root.querySelectorAll('input[type="checkbox"][data-page-id]')) {
      cb.checked = !allSelected;
    }
    updatePayloadCount();
    updateRelatedToggleLabel();
  });

  $("recallSearch").onclick = () => recallSearch().catch((e) => setStatus(e.message, "danger"));
  for (const el of ["matchTime", "matchText", "matchTitle", "matchEmbeddings"]) {
    $(el)?.addEventListener("change", () => {
      dbg("matchers:change", { matchers: getRelatedMatchers(), searchActive: isRecallSearchActive() });
      if (isRecallSearchActive()) return;
      recallSearch().catch(() => {});
    });
  }
  // Live search (debounced) for tag + KV fields.
  let recallDebounce = null;
  function liveRecall() {
    if (recallDebounce) clearTimeout(recallDebounce);
    recallDebounce = setTimeout(() => recallSearch().catch(() => {}), 200);
  }
  $("recallTag").addEventListener("input", liveRecall);
  $("recallKvKey")?.addEventListener("input", liveRecall);
  $("recallKvValue")?.addEventListener("input", liveRecall);
  $("recallKvKey")?.addEventListener("change", async () => {
    // Purpose: when a KV key is selected from suggestions, prefill the value with the most common one.
    if (!kvTagStats) await ensureRecentPagesCache().catch(() => {});
    const key = ($("recallKvKey")?.value || "").trim();
    const valueEl = $("recallKvValue");
    if (!key || !valueEl) return;
    if ((valueEl.value || "").trim()) return; // don't override user input
    const topValue = kvTagStats?.get(key)?.topValue ?? "";
    if (topValue) {
      valueEl.value = topValue;
      recallSearch().catch(() => {});
    }
  });
  $("newPage").onclick = () => setSelectedPage(null);
  $("pageTagPreset")?.addEventListener("change", () => {
    // Purpose: add a predefined tag set to the Tags box (deduped).
    const sel = $("pageTagPreset");
    const raw = sel?.value || "";
    if (!raw) return;
    const preset = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const el = $("pageTags");
    const merged = Array.from(new Set([...parseTags(el?.value), ...preset]));
    if (el) {
      el.value = merged.join(", ");
      dispatchInputEvents(el);
    }
    sel.value = "";
  });
  $("savePage").onclick = () => savePage().catch((e) => setStatus(e.message, "danger"));
  $("deletePage").onclick = () => deletePage().catch((e) => setStatus(e.message, "danger"));
  $("pageContent").addEventListener("input", () => {
    // While editing, keep preview up-to-date (even if hidden).
    renderPreview();
    // Wikilink picker in markdown editor.
    openOrUpdateWikilinkPicker($("pageContent")).catch(() => {});
  });
  $("pageContent").addEventListener("keydown", handleWikilinkKeydown);
  $("pageContent").addEventListener("blur", () => {
    // Leave edit mode on blur.
    isEditingMarkdown = false;
    syncMarkdownWidget();
    closeWikilinkPicker();
  });
  $("pagePreview").addEventListener("dblclick", () => {
    // Enter edit mode on double-click.
    isEditingMarkdown = true;
    syncMarkdownWidget();
    $("pageContent").focus();
  });

  $("sendChat").onclick = () => sendChat().catch((e) => setStatus(e.message, "danger"));
  $("chatInput").addEventListener("keydown", (e) => {
    handleWikilinkKeydown(e);
    if (e.defaultPrevented) return; // wikilink picker consumed the key (e.g. Enter to select)
    // Enter submits; Shift+Enter inserts newline (since this is a textarea).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat().catch((err) => setStatus(err.message, "danger"));
    }
  });
  $("chatInput").addEventListener("input", () => {
    // While recall search fields are empty, keep the related pages list synced to chat input.
    dbg("chatInput:input", { len: ($("chatInput")?.value || "").length, searchActive: isRecallSearchActive() });

    // Wikilink picker in chat box.
    openOrUpdateWikilinkPicker($("chatInput")).catch(() => {});

    if (isRecallSearchActive()) return;
    if (!getLiveRelated()) return;
    if (relatedDebounce) clearTimeout(relatedDebounce);
    relatedDebounce = setTimeout(() => {
      recallSearch().catch(() => {});
    }, 800);
  });

  // Click wikilinks in previews/chat to open pages.
  $("pagePreview")?.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a.enkidu-wikilink");
    if (!a) return;
    e.preventDefault();
    openPageByTitle(a.dataset.wikilinkTitle).catch((err) => setStatus(err.message, "danger"));
  });
  $("chatLog")?.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a.enkidu-wikilink");
    if (!a) return;
    e.preventDefault();
    openPageByTitle(a.dataset.wikilinkTitle).catch((err) => setStatus(err.message, "danger"));
  });

  window.addEventListener("resize", () => {
    if (wikilinkPicker?.open) {
      const el = $(wikilinkPicker.targetId);
      if (el) positionPickerNearEl(el);
    }
  });
  $("reloadChat").onclick = () => reloadThread().catch((e) => setStatus(e.message, "danger"));
  $("newThread").onclick = () => newThread();
  $("threadSelect").addEventListener("change", () => {
    reloadThread().catch((e) => setStatus(e.message, "danger"));
  });
  $("clearPayload").onclick = () => {
    selectedPayloadIds.clear();
    updatePayloadCount();
    updateRelatedToggleLabel();
    recallSearch().catch(() => {});
  };
  $("runDream").onclick = () => runDream().catch((e) => setStatus(e.message, "danger"));
  $("runBackfillEmbeddings").onclick = () =>
    runBackfillEmbeddings().catch((e) => setStatus(e.message, "danger"));

  $("adminToken").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("saveToken").click();
    }
  });

  // Try initial load if token exists.
  if (getToken()) {
    recallSearch().catch(() => {});
    loadModels().catch(() => {});
    loadThreads().catch(() => {});
    ensureRecentPagesCache().catch(() => {});
  }
}

async function loadModels() {
  setStatus("Loading models...", "secondary");
  const data = await apiFetch("/api/models");
  setModelOptions(data.models || []);
  setStatus("Ready.", "success");
}

function renderThreadOptions(threads, selectedThreadId) {
  const sel = $("threadSelect");
  sel.innerHTML = "";

  const optNew = document.createElement("option");
  optNew.value = "";
  optNew.textContent = "(new thread)";
  sel.appendChild(optNew);

  for (const t of threads || []) {
    const o = document.createElement("option");
    o.value = t.thread_id;
    const when = t.last_created_at ? new Date(t.last_created_at).toLocaleString() : "";
    const title = t.thread_title || "";
    o.textContent = title ? `${title} — ${when}` : (when || t.thread_id);
    sel.appendChild(o);
  }

  if (selectedThreadId) sel.value = selectedThreadId;
}

async function loadThreads(selectThreadId = null) {
  const data = await apiFetch("/api/threads");
  renderThreadOptions(data.threads || [], selectThreadId);
}

async function runDream() {
  setStatus("Dreaming...", "secondary");
  const data = await apiFetch("/api/dream", { method: "POST", body: { limit: 8 } });
  // Refresh caches and UI lists after the dream changed some pages.
  recentPagesCache = null;
  await recallSearch();
  const msg =
    data && typeof data === "object"
      ? `Dream done. Candidates ${data.candidates ?? "?"}, proposed ${data.proposed ?? "?"}, updated ${data.updated ?? 0}. Diary: ${data.diaryPageId || "(none)"}.`
      : "Dream done.";
  setStatus(msg, "success");
}

async function runBackfillEmbeddings() {
  // Purpose: backfill embeddings for existing pages in small batches (admin-only).
  setStatus("Backfilling embeddings (batch)...", "secondary");
  const data = await apiFetch("/api/backfill-embeddings?limit=25", { method: "POST" });
  const msg =
    data && typeof data === "object"
      ? `Backfill done. Updated ${data.updated ?? 0}/${data.scanned ?? "?"}. ${data.remaining_hint || ""}`
      : "Backfill done.";
  setStatus(msg, "success");
}

init();


