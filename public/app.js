// Enkidu frontend (vanilla JS).
// Purpose: minimal chat + recall UI talking to Netlify Functions.

const LS_TOKEN_KEY = "enkidu_admin_token";
const LS_ALLOW_SECRETS_KEY = "enkidu_allow_secrets";
const LS_USE_WEB_SEARCH_KEY = "enkidu_use_web_search";
const LS_PAGES_CACHE_KEY = "enkidu_pages_cache_v1";
const LS_PAGES_CACHE_TS_KEY = "enkidu_pages_cache_ts_v1";
const LS_API_BASE_KEY = "enkidu_api_base_url";
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

function isLocalhostUi() {
  // Purpose: treat local dev as "single box" (UI + API same-origin) to avoid CORS footguns.
  const h = String(window.location.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

// NOTE: `openPageById()` is defined later (single canonical definition). Keep only one copy.

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
  el.className = `alert alert-${kind} py-1 px-2 small mb-0 text-truncate`;
  el.textContent = text;
}

// -------------------------
// KV tags builder (UI only; textarea remains the source of truth)
// -------------------------

let kvTagsBuilderUpdating = false;
let kvTagsBuilderDebounce = null;
let kvTagKeyCounts = null; // computed from recent pages: key -> count (for builder key suggestions)
let kvSectionForceNext = false; // Purpose: after loading a page, auto-collapse KV section when it has >3 keys.

function kvTagsRefreshKeyDatalist() {
  // Purpose: offer frequent KV keys first, but allow matching any known key while typing.
  const dl = $("kvTagsKeySuggestions");
  if (!dl) return;
  if (!kvTagKeyCounts) {
    dl.innerHTML = "";
    return;
  }

  const keys = Array.from(kvTagKeyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  dl.innerHTML = "";
  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    dl.appendChild(opt);
  }
}

function kvTagsRefreshValueDatalistForKey(key) {
  // Purpose: offer frequent values for the selected key first, but allow matching any known value while typing.
  const dl = $("kvTagsValueSuggestions");
  if (!dl) return;
  const k = String(key || "").trim();
  const stats = k ? kvTagStats?.get(k) : null;
  const counts = stats?.counts;

  dl.innerHTML = "";
  if (!counts || !(counts instanceof Map)) return;

  const values = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v)
    .filter((v) => String(v || "").length); // skip empty suggestions

  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  }
}

function kvTagsApplySuggestionsToRow(tr) {
  // Purpose: wire a builder row's key/value inputs to key + per-key value datalists.
  if (!tr) return;
  const inputs = tr.querySelectorAll("input");
  const keyInput = inputs && inputs[0];
  const valInput = inputs && inputs[1];
  if (!keyInput || !valInput) return;

  keyInput.setAttribute("list", "kvTagsKeySuggestions");
  valInput.setAttribute("list", "kvTagsValueSuggestions");

  // Keep the value list in sync with the key for this row.
  function refreshValues() {
    kvTagsRefreshValueDatalistForKey((keyInput.value || "").trim());
  }
  keyInput.addEventListener("input", refreshValues);
  keyInput.addEventListener("change", refreshValues);
  valInput.addEventListener("focus", refreshValues);
}

function kvTagsValueFromText(raw) {
  // Purpose: allow quick entry without quotes, while still supporting JSON literals.
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("{") || s.startsWith("[") || (s.startsWith('"') && s.endsWith('"'))) {
    try {
      return JSON.parse(s);
    } catch {
      // fall through to string
    }
  }
  return String(raw ?? "");
}

function kvTagsSetMsg(msg) {
  const el = $("kvTagsBuilderMsg");
  if (!el) return;
  el.textContent = msg ? String(msg) : "";
}

function kvTagsRenderRowsFromObject(obj) {
  const tbody = $("kvTagsRows");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [k, v] of Object.entries(obj || {})) {
    const tr = document.createElement("tr");
    tr.dataset.kvRow = "1";

    const tdKey = document.createElement("td");
    const keyInput = document.createElement("input");
    keyInput.className = "form-control form-control-sm";
    keyInput.value = String(k);
    keyInput.placeholder = "key";
    tdKey.appendChild(keyInput);

    const tdVal = document.createElement("td");
    const valInput = document.createElement("input");
    valInput.className = "form-control form-control-sm font-monospace";
    valInput.value = typeof v === "string" ? v : JSON.stringify(v);
    valInput.placeholder = "value";
    tdVal.appendChild(valInput);

    const tdDel = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-sm btn-outline-danger";
    delBtn.setAttribute("aria-label", "Delete KV row");
    delBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
    tdDel.appendChild(delBtn);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdDel);
    tbody.appendChild(tr);

    function onEdit() {
      kvTagsSyncRowsToTextarea();
    }
    keyInput.addEventListener("input", onEdit);
    valInput.addEventListener("input", onEdit);
    delBtn.addEventListener("click", () => {
      tr.remove();
      kvTagsSyncRowsToTextarea();
    });

    kvTagsApplySuggestionsToRow(tr);
  }
}

function kvTagsReadRows() {
  const rows = [];
  for (const tr of document.querySelectorAll("#kvTagsRows tr[data-kv-row='1']")) {
    const inputs = tr.querySelectorAll("input");
    // Note: avoid optional chaining on array indexing (inputs?.[0]) for broad browser compatibility.
    const key = ((inputs && inputs[0] && inputs[0].value) || "").trim();
    const rawVal = inputs && inputs[1] && inputs[1].value != null ? inputs[1].value : "";
    rows.push({ key, rawVal });
  }
  return rows;
}

function kvTagsSyncRowsToTextarea() {
  // Purpose: write builder state back into JSON textarea (single source of truth).
  const ta = $("pageKvTags");
  if (!ta) return;

  const obj = {};
  const seen = new Set();
  const dupes = new Set();

  for (const r of kvTagsReadRows()) {
    if (!r.key) continue; // ignore empty draft rows
    if (seen.has(r.key)) dupes.add(r.key);
    seen.add(r.key);
    obj[r.key] = kvTagsValueFromText(r.rawVal);
  }

  kvTagsBuilderUpdating = true;
  ta.value = JSON.stringify(obj, null, 2);
  kvTagsBuilderUpdating = false;
  refreshClearButtons();

  kvTagsSetMsg(dupes.size ? `Duplicate keys: ${Array.from(dupes).join(", ")} (last wins).` : "");
}

function kvTagsRefreshFromTextarea() {
  // Purpose: parse textarea JSON and reflect it as editable rows.
  const ta = $("pageKvTags");
  if (!ta) return;

  const kvDetails = $("kvSection");
  const kvCountBadge = $("kvSectionCount");

  let obj = {};
  const raw = String(ta.value || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      kvTagsSetMsg("");
    } catch {
      if (kvCountBadge) kvCountBadge.textContent = "!";
      if (kvDetails) kvDetails.open = true; // keep visible so the user can fix JSON
      kvSectionForceNext = false;
      kvTagsSetMsg("Invalid JSON in KV tags textbox (builder paused until fixed or overwritten by editing rows).");
      return; // don't destroy current rows while user is mid-edit in the textarea
    }
  } else {
    kvTagsSetMsg("");
  }

  const keyCount = Object.keys(obj || {}).length;
  if (kvCountBadge) kvCountBadge.textContent = String(keyCount);
  if (kvDetails) {
    if (kvSectionForceNext) {
      // Purpose: default collapsed for "many" keys when the page is loaded/selected.
      kvDetails.open = keyCount <= 3;
    } else if (keyCount <= 3) {
      // Purpose: if KV tags become small again, auto-open; don't auto-close while user is editing.
      kvDetails.open = true;
    }
  }
  kvSectionForceNext = false;
  kvTagsRenderRowsFromObject(obj);
}

function initKvTagsBuilder() {
  // Purpose: wire KV builder to the textarea.
  if (!$("kvTagsBuilder") || !$("pageKvTags") || !$("kvTagsRows") || !$("kvTagsAddRow")) return;

  // Populate suggestions if we already have stats (e.g., after token saved on a previous session).
  kvTagsRefreshKeyDatalist();

  $("kvTagsAddRow").addEventListener("click", () => {
    const tbody = $("kvTagsRows");
    const tr = document.createElement("tr");
    tr.dataset.kvRow = "1";
    tr.innerHTML = `
      <td><input class="form-control form-control-sm" placeholder="key" /></td>
      <td><input class="form-control form-control-sm font-monospace" placeholder="value" /></td>
      <td>
        <button type="button" class="btn btn-sm btn-outline-danger" aria-label="Delete KV row">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    const keyInput = tr.querySelectorAll("input")[0];
    const valInput = tr.querySelectorAll("input")[1];
    const delBtn = tr.querySelector("button");

    function onEdit() {
      kvTagsSyncRowsToTextarea();
    }
    keyInput.addEventListener("input", onEdit);
    valInput.addEventListener("input", onEdit);
    delBtn.addEventListener("click", () => {
      tr.remove();
      kvTagsSyncRowsToTextarea();
    });

    kvTagsApplySuggestionsToRow(tr);
    keyInput.focus();
  });

  $("pageKvTags").addEventListener("input", () => {
    if (kvTagsBuilderUpdating) return;
    if (kvTagsBuilderDebounce) clearTimeout(kvTagsBuilderDebounce);
    kvTagsBuilderDebounce = setTimeout(() => kvTagsRefreshFromTextarea(), 150);
  });

  kvTagsRefreshFromTextarea();
}

function getToken() {
  return localStorage.getItem(LS_TOKEN_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(LS_TOKEN_KEY, token);
}

function getApiBaseUrl() {
  // Purpose: allow hosting API separately (e.g. Cloud Run) while keeping UI static (e.g. Netlify).
  // IMPORTANT: in local dev, always use same-origin (/api/* via netlify dev) so everything works
  // without requiring Cloud Run CORS setup or remembering stale saved API base URLs.
  if (isLocalhostUi()) return "";
  return (localStorage.getItem(LS_API_BASE_KEY) || "").trim().replace(/\/+$/, "");
}

function setApiBaseUrl(url) {
  const cleaned = String(url || "").trim().replace(/\/+$/, "");
  localStorage.setItem(LS_API_BASE_KEY, cleaned);
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

function readClipParams() {
  // Purpose: allow a bookmarklet to open Enkidu and auto-create a new page from URL/title/selection.
  // Expected: ?clip=1&clip_id=...&url=...&title=...&text=...
  const sp = new URLSearchParams(window.location.search || "");
  if (sp.get("clip") !== "1") return null;
  return {
    clip_id: sp.get("clip_id") || "",
    url: sp.get("url") || "",
    title: sp.get("title") || "",
    text: sp.get("text") || "",
  };
}

function clearClipParamsFromUrl() {
  const u = new URL(window.location.href);
  for (const k of ["clip", "clip_id", "url", "title", "text"]) u.searchParams.delete(k);
  const next = `${u.pathname}${u.search}${u.hash}`;
  window.history.replaceState({}, "", next);
}

async function apiFetch(path, { method = "GET", body } = {}) {
  const token = getToken();
  const allowSecrets = getAllowSecrets();
  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
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

// -------------------------
// Chat in-flight guard
// -------------------------
// Purpose: In `netlify dev` (lambda-local) long /api/chat requests can get cut off when the UI fires other
// concurrent API calls (e.g. opening a Related page triggers /api/page). Keep this simple: while chat is
// in-flight, block page-open actions to avoid terminating the chat request.
let chatInFlight = false;

// -------------------------
// Idle detector (for background embedding backfill)
// -------------------------
// Purpose: only backfill embeddings when the user is idle, and stop immediately when they become active.
let lastUserActivityAtMs = Date.now();
let autoBackfillController = null;
let dreamInFlight = false; // Purpose: avoid overlapping Dream runs (manual button + auto idle trigger).
function markUserActivity() {
  lastUserActivityAtMs = Date.now();
  // Stop any background backfill as soon as the user interacts again.
  if (autoBackfillController) {
    try {
      autoBackfillController.abort();
    } catch {
      // ignore
    }
    autoBackfillController = null;
  }
}

function setChatInFlight(on) {
  chatInFlight = !!on;
  const btn = $("sendChat");
  if (btn) btn.disabled = chatInFlight; // prevent double-send while a request is active
}

async function autoBackfillEmbeddingsOnce() {
  // Purpose: run a tiny backfill batch using AbortController so we can pause on user activity.
  const token = getToken();
  if (!token) return;
  const base = getApiBaseUrl();
  const url = base ? `${base}/api/backfill-embeddings?limit=1` : "/api/backfill-embeddings?limit=1";

  autoBackfillController = new AbortController();
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: "{}",
      signal: autoBackfillController.signal,
    });
  } finally {
    autoBackfillController = null;
  }
}

async function refreshEmbeddingStatus() {
  // Purpose: small top-bar notification so you can see background embedding backfill is working.
  // If the scheduled backfill is running, missing count should drift toward 0 over time.
  const el = document.getElementById("embeddingStatus");
  if (!el) return;
  if (!getToken()) {
    el.textContent = "Embeddings: (no token)";
    el.className = "badge text-bg-secondary";
    return;
  }
  try {
    const data = await apiFetch("/api/embeddings-status");
    const n = Number(data?.missing_embeddings);
    if (!Number.isFinite(n)) throw new Error("Bad embeddings-status response");
    // Drain backlog only when idle (pause as soon as the user interacts).
    if (n > 0 && !chatInFlight) {
      const now = Date.now();
      if (!window.__enkiduLastAutoBackfillAtMs) window.__enkiduLastAutoBackfillAtMs = 0;
      const idleMs = now - lastUserActivityAtMs;
      if (idleMs > 120_000 && now - window.__enkiduLastAutoBackfillAtMs > 60_000) {
        window.__enkiduLastAutoBackfillAtMs = now;
        autoBackfillEmbeddingsOnce().catch(() => {});
      }
    }

    // Auto-dream: when you're idle AND embeddings are up-to-date, run a Dream pass periodically.
    // Purpose: Dreaming shouldn't require a button press, and it should naturally include the background embedding generation work.
    if (n <= 0 && !chatInFlight && !dreamInFlight) {
      const now = Date.now();
      if (!window.__enkiduLastAutoDreamAtMs) window.__enkiduLastAutoDreamAtMs = 0;
      const idleMs = now - lastUserActivityAtMs;
      // Keep conservative: only when idle for a while, and at most once per 15 minutes.
      if (idleMs > 180_000 && now - window.__enkiduLastAutoDreamAtMs > 15 * 60_000) {
        window.__enkiduLastAutoDreamAtMs = now;
        runDream().catch(() => {});
      }
    }
    if (n <= 0) {
      el.textContent = "Embeddings: OK";
      el.className = "badge text-bg-success";
    } else {
      el.textContent = `Embeddings missing: ${n}`;
      el.className = "badge text-bg-warning";
    }
  } catch {
    // Keep UI calm; just show unknown on transient errors.
    el.textContent = "Embeddings: ?";
    el.className = "badge text-bg-secondary";
  }
}

function startEmbeddingStatusPoll() {
  // Purpose: poll lightly; keep it cheap.
  refreshEmbeddingStatus().catch(() => {});
  setInterval(() => refreshEmbeddingStatus().catch(() => {}), 30000);
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

function readPagesCacheFromStorage() {
  // Purpose: avoid repeatedly fetching thousands of pages in local dev.
  // Cache is metadata-only (light=1): no content_md.
  try {
    const ts = Number(localStorage.getItem(LS_PAGES_CACHE_TS_KEY) || 0);
    const raw = localStorage.getItem(LS_PAGES_CACHE_KEY) || "";
    if (!raw) return null;
    // TTL: 6 hours (good enough; user can invalidate by saving/deleting pages).
    const ttlMs = 6 * 60 * 60 * 1000;
    if (!Number.isFinite(ts) || Date.now() - ts > ttlMs) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePagesCacheToStorage(pages) {
  try {
    localStorage.setItem(LS_PAGES_CACHE_KEY, JSON.stringify(pages || []));
    localStorage.setItem(LS_PAGES_CACHE_TS_KEY, String(Date.now()));
  } catch {
    // ignore (storage full/private mode/etc)
  }
}

function invalidatePagesCache({ reason = "" } = {}) {
  // Purpose: keep cached titles/tags reasonably fresh.
  recentPagesCache = null;
  kvTagStats = null;
  try {
    localStorage.removeItem(LS_PAGES_CACHE_KEY);
    localStorage.removeItem(LS_PAGES_CACHE_TS_KEY);
  } catch {}
  if (reason) dbg("pagesCache:invalidated", { reason });
}

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

// -------------------------
// Chat bubble helpers (page-id links + JSON collapse)
// -------------------------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function extractUuids(text, { limit = 12 } = {}) {
  const s = String(text || "");
  const out = [];
  const seen = new Set();
  let m;
  while ((m = UUID_RE.exec(s))) {
    const id = String(m[0] || "").toLowerCase();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function linkifyPageIdsInText(container) {
  // Purpose: turn UUIDs in visible chat text into clickable links to load the RHS page editor.
  if (!container) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest("a")) continue; // don't nest links

    const text = node.nodeValue || "";
    UUID_RE.lastIndex = 0;
    if (!UUID_RE.test(text)) continue;
    UUID_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = UUID_RE.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));

      const id = String(m[0] || "");
      const a = document.createElement("a");
      a.href = "#";
      a.className = "enkidu-page-id font-monospace";
      a.dataset.pageId = id;
      a.textContent = id;
      frag.appendChild(a);

      last = end;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

function collapseJsonCodeBlocks(container) {
  // Purpose: replace verbose ```json blocks with a collapsible <details> showing a short summary.
  if (!container) return;
  const pres = Array.from(container.querySelectorAll("pre"));
  for (const pre of pres) {
    const code = pre.querySelector("code");
    if (!code) continue;

    const cls = String(code.className || "");
    const isJson = cls.includes("language-json");
    if (!isJson) continue;

    const raw = String(code.textContent || "").trim();
    if (!raw) continue;

    let summaryText = `JSON (${raw.length} chars)`;
    try {
      const parsed = JSON.parse(raw);
      // Special-case common tool result shapes so the collapsed summary is actually informative.
      // Examples:
      // - { pages: [...] } => "pages: N"
      // - { count: N }    => "count: N"
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.pages)) {
          summaryText = `JSON (pages: ${parsed.pages.length})`;
        } else if (Number.isFinite(Number(parsed.count))) {
          summaryText = `JSON (count: ${Number(parsed.count)})`;
        }
      }
      if (Array.isArray(parsed)) {
        summaryText = `JSON array (${parsed.length} items)`;
      } else if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed).slice(0, 6);
        summaryText = keys.length ? `JSON object (keys: ${keys.join(", ")})` : "JSON object";
      }
    } catch {
      // leave summaryText as length-based
    }

    const ids = extractUuids(raw, { limit: 8 });

    const oldParent = pre.parentNode;
    if (!oldParent) continue;

    const details = document.createElement("details");
    details.className = "enkidu-json-details";

    const summary = document.createElement("summary");
    summary.className = "enkidu-json-summary";
    summary.appendChild(document.createTextNode(summaryText));

    if (ids.length) {
      const wrap = document.createElement("span");
      wrap.className = "ms-2";
      wrap.appendChild(document.createTextNode("Open: "));
      for (const id of ids) {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "enkidu-page-id badge text-bg-light border ms-1";
        a.dataset.pageId = id;
        a.textContent = id.slice(0, 8);
        wrap.appendChild(a);
      }
      summary.appendChild(wrap);
    }

    // Replace the original <pre> with <details>, then move the <pre> inside the <details>.
    oldParent.replaceChild(details, pre);
    details.appendChild(summary);
    details.appendChild(pre);
  }
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

function unwrapEnkiduAgentEnvelope(rawText) {
  // Purpose: if the backend stored the agent JSON envelope, show the human text instead of literal JSON.
  // Envelope shape: {"enkidu_agent":{"type":"final"|"plan"|...,"text":"...markdown..."}}
  const s = String(rawText || "").trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(s);
    const text = parsed?.enkidu_agent?.text;
    if (typeof text === "string") return text;
    return null;
  } catch {
    return null;
  }
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

  // Always pin the "behavioral" tags at the top (these are real tags stored on pages).
  const pinned = [
    "*chat",
    "*system",
    "*style",
    "*bio",
    "*strategy",
    "*habits",
    "*preference",
    "*dream-prompt",
    "*split-prompt",
    "*dream-diary",
  ];

  const counts = new Map(); // tag -> count
  for (const p of pages || []) {
    for (const t of p?.tags || []) {
      const tag = String(t).trim();
      if (!tag) continue;
      if (pinned.includes(tag)) continue; // already shown at the top
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);

  dl.innerHTML = "";
  for (const tag of pinned) {
    const opt = document.createElement("option");
    opt.value = tag;
    dl.appendChild(opt);
  }
  for (const tag of top) {
    const opt = document.createElement("option");
    opt.value = tag;
    dl.appendChild(opt);
  }
}

function normalizeTagFilter(raw) {
  // Purpose: accept a single tag filter exactly as typed.
  return String(raw || "").trim();
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

  kvTagKeyCounts = keyCounts;
  kvTagsRefreshKeyDatalist();

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

  // Prefer localStorage cache (fast, no network).
  const cached = readPagesCacheFromStorage();
  if (cached) {
    recentPagesCache = cached;
    updateTagSuggestionsFromPages(recentPagesCache);
    updateKvKeySuggestionsFromPages(recentPagesCache);
    dbg("pagesCache:hit", { count: recentPagesCache.length });
    return recentPagesCache;
  }

  // Load a larger window so wikilink/title pickers can see "any page" in normal use.
  // IMPORTANT: use light=1 to avoid fetching full content_md for thousands of pages (too slow).
  const data = await apiFetch(`/api/pages?limit=2000&light=1`);
  recentPagesCache = data.pages || [];
  writePagesCacheToStorage(recentPagesCache);
  updateTagSuggestionsFromPages(recentPagesCache);
  updateKvKeySuggestionsFromPages(recentPagesCache);
  dbg("pagesCache:miss", { count: recentPagesCache.length });
  return recentPagesCache;
}

async function openPageById(pageId) {
  // Purpose: centralise "open this page in the editor" for wikilinks and list clicks.
  if (chatInFlight) {
    setStatus("Chat request in progress — wait for reply before opening pages.", "secondary");
    return;
  }
  setStatus("Loading page...", "secondary");
  const one = await apiFetch(`/api/page?id=${encodeURIComponent(pageId)}`);
  setSelectedPage(one.page, { newMode: false });
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
let isNewPageMode = false; // Purpose: distinguish "New page" mode from "nothing selected" (startup/after delete).
let isEditingMarkdown = false; // merged markdown+preview: preview by default when non-empty
let autosaveDebounce = null;
let autosaveInFlight = false; // Purpose: avoid overlapping autosave requests (can create multiple pages).
let autosaveRequestedDuringFlight = false; // Purpose: if user types while saving, queue one more autosave after finish.
let suppressAutosave = false; // Purpose: avoid autosave when we programmatically fill fields.
let lastSavedPayloadJson = null; // Purpose: avoid saving when nothing changed.
let previewClickTimer = null; // Purpose: single-click opens modal; double-click edits (cancel timer).

function syncRecallEditorVisibility() {
  // Purpose: avoid showing editor fields when there's no selected page and we're not creating a new one.
  const fields = $("recallEditorFields");
  const empty = $("recallEditorEmpty");
  if (!fields || !empty) return;

  const showEditor = !!selectedPageId || isNewPageMode;
  fields.classList.toggle("d-none", !showEditor);
  empty.classList.toggle("d-none", showEditor);

  // Purpose: delete only makes sense when a page is selected (payload deletes are via checkboxes).
  const del = $("deletePage");
  if (del) del.disabled = !selectedPageId;
}

function openPreviewModal() {
  // Purpose: show the rendered preview in a large modal (workaround for tricky scroll sizing).
  const modal = $("enkiduPreviewModal");
  const body = $("enkiduPreviewModalBody");
  const title = $("enkiduPreviewModalTitle");
  if (!modal || !body) return;

  if (title) title.textContent = ($("pageTitle")?.value || "").trim() || "Preview";
  body.innerHTML = $("pagePreview")?.innerHTML || "";
  modal.classList.remove("d-none");
  modal.setAttribute("aria-hidden", "false");
}

function closePreviewModal() {
  const modal = $("enkiduPreviewModal");
  const body = $("enkiduPreviewModalBody");
  if (!modal) return;
  modal.classList.add("d-none");
  modal.setAttribute("aria-hidden", "true");
  if (body) body.innerHTML = "";
}

function buildRecallPayloadFromUi() {
  // Purpose: compute the payload we'd save for the currently visible Recall editor fields.
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

  return {
    title: $("pageTitle").value || null,
    tags: parseTags($("pageTags").value),
    content_md: $("pageContent").value || "",
    kv_tags,
  };
}

function isPayloadEmpty(payload) {
  // Purpose: avoid auto-creating totally empty pages.
  const hasTitle = !!String(payload?.title || "").trim();
  const hasTags = Array.isArray(payload?.tags) && payload.tags.length > 0;
  const hasContent = !!String(payload?.content_md || "").trim();
  const hasKv =
    payload?.kv_tags && typeof payload.kv_tags === "object" && !Array.isArray(payload.kv_tags) && Object.keys(payload.kv_tags).length > 0;
  return !(hasTitle || hasTags || hasContent || hasKv);
}

function scheduleAutosave() {
  // Purpose: debounced autosave for Recall editor fields (no Save button).
  if (suppressAutosave) return;
  if (!getToken()) return;

  if (autosaveDebounce) clearTimeout(autosaveDebounce);
  autosaveDebounce = setTimeout(() => {
    autosaveDebounce = null;
    autosaveNow().catch((e) => setStatus(String(e.message || e), "danger"));
  }, 800);
}

async function autosaveNow() {
  if (suppressAutosave) return;
  let payload;
  try {
    payload = buildRecallPayloadFromUi();
  } catch {
    // Invalid KV JSON (etc): don't autosave until user fixes it.
    return;
  }
  if (!selectedPageId && isPayloadEmpty(payload)) return;

  const payloadJson = JSON.stringify(payload);
  if (payloadJson === lastSavedPayloadJson) return;

  // Prevent overlapping autosaves (especially important before the first create returns an id).
  if (autosaveInFlight) {
    autosaveRequestedDuringFlight = true;
    return;
  }

  autosaveInFlight = true;
  try {
    await savePage({ reason: "autosave" });
    // Important: record what we actually attempted to save (not whatever the user typed while the request was in-flight).
    lastSavedPayloadJson = payloadJson;
  } finally {
    autosaveInFlight = false;
    if (autosaveRequestedDuringFlight) {
      autosaveRequestedDuringFlight = false;
      scheduleAutosave(); // debounce + save the latest edits (if any) after this request completed
    }
  }
}

function renderPreview() {
  const md = $("pageContent").value || "";
  const el = $("pagePreview");
  if (!el) return;
  el.innerHTML = window.marked ? window.marked.parse(preprocessWikilinks(md)) : md;
  // Apply the same readability improvements as chat bubbles.
  collapseJsonCodeBlocks(el);
  linkifyPageIdsInText(el);
}

function syncMarkdownWidget() {
  // Purpose: merge editor + preview. If non-empty and not editing => show preview; else show editor.
  const md = $("pageContent").value || "";
  const hasMd = !!md.trim();
  const mdWrap = document.querySelector(".enkidu-md-wrap");
  const previewWrap = document.querySelector(".enkidu-preview-wrap");

  if (!isEditingMarkdown && hasMd) {
    renderPreview();
    $("pageContent").style.display = "none";
    $("pagePreview").style.display = "block";
    if (mdWrap) mdWrap.style.display = "none";
    if (previewWrap) previewWrap.style.display = "flex";
  } else {
    // Show editor (empty pages start here; double-click switches here).
    $("pageContent").style.display = "block";
    $("pagePreview").style.display = "none";
    if (mdWrap) mdWrap.style.display = "flex";
    if (previewWrap) previewWrap.style.display = "none";
  }

}

function setSelectedPage(page, { newMode = false } = {}) {
  suppressAutosave = true;
  // Purpose: explicitly track whether we're creating a new page or viewing an existing one.
  isNewPageMode = !!newMode;
  selectedPageId = page?.id || null;
  $("pageId").textContent = selectedPageId || "(none)";
  $("pageTitle").value = page?.title || "";
  $("pageTags").value = (page?.tags || []).join(", ");
  $("pageKvTags").value = JSON.stringify(page?.kv_tags || {}, null, 2);
  $("pageContent").value = page?.content_md || "";
  isEditingMarkdown = false;
  syncMarkdownWidget();
  refreshClearButtons();
  kvSectionForceNext = true;
  kvTagsRefreshFromTextarea();
  try {
    lastSavedPayloadJson = JSON.stringify(buildRecallPayloadFromUi());
  } catch {
    lastSavedPayloadJson = null;
  }
  suppressAutosave = false;
  updateRecallCurrentHighlight();
  syncRecallEditorVisibility();
}

function updateRecallCurrentHighlight() {
  // Purpose: visually mark the "current" page in the Related/Recall list (for j/k navigation).
  const root = $("recallResults");
  if (!root) return;
  for (const btn of root.querySelectorAll("button[data-open-page-id]")) {
    const isCurrent = selectedPageId && btn.dataset.openPageId === selectedPageId;
    btn.classList.toggle("btn-primary", !!isCurrent);
    btn.classList.toggle("text-white", !!isCurrent);
    btn.classList.toggle("btn-light", !isCurrent);
  }
}

function renderRecallResults(pages) {
  const root = $("recallResults");
  root.innerHTML = "";

  function displayTitleFromPage(p) {
    // Purpose: label pages consistently even when title is blank (use first non-empty content line).
    const t = String(p?.title || "").trim();
    if (t) return t;
    const md = String(p?.content_md || "");
    for (const rawLine of md.split(/\r?\n/)) {
      let line = String(rawLine || "").trim();
      if (!line) continue;
      // Normalize common headings like "# Foo" -> "Foo" (keeps UI tidy without changing stored content).
      line = line.replace(/^#{1,6}\s+/, "");
      if (!line) continue;
      return line;
    }
    return "";
  }

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
    // Purpose: show the current page (selectedPageId) distinctly using Bootstrap styles.
    const isCurrent = selectedPageId && p.id === selectedPageId;
    btn.className = `btn btn-sm ${isCurrent ? "btn-primary text-white" : "btn-light"} w-100 text-start`;
    btn.dataset.openPageId = p.id;

    const title = displayTitleFromPage(p) || "(untitled)";
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
    btn.onclick = () => openPageById(p.id).catch((err) => setStatus(err.message, "danger"));

    row.appendChild(cb);
    row.appendChild(btn);
    root.appendChild(row);
  }

  updateRelatedToggleLabel();
  updateRecallCurrentHighlight();
}

async function recallSearch() {
  const tag = normalizeTagFilter(($("recallTag").value || "").trim());
  const kvKey = ($("recallKvKey")?.value || "").trim();
  const kvValue = ($("recallKvValue")?.value || "").trim();
  const chatText = ($("chatInput")?.value || "").trim();
  const hasFilters = !!(tag || kvKey || kvValue);
  const matchers0 = getRelatedMatchers();
  dbg("recallSearch:start", {
    mode: hasFilters ? "filtered-related" : "related",
    chatTextLen: chatText.length,
    tag,
    kvKey,
    kvValue,
    matchers: matchers0,
  });

  // If user typed tag/KV filters WITHOUT any chat text, use server search (filters-only).
  // When chat text exists, we keep "Related" behavior and apply tag/KV as additive filters.
  if (hasFilters && !chatText) {
    if ((kvKey && !kvValue) || (!kvKey && kvValue)) {
      throw new Error("KV filter requires both key and value");
    }
    setStatus("Searching...", "secondary");
    const params = [];
    params.push("limit=50");
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
  const matchers = getRelatedMatchers();
  const requestSeq = ++relatedRequestSeq;
  dbg("recallSearch:related", { requestSeq, chatTextLen: chatText.length, matchers });

  setStatus("Loading related pages...", "secondary");

  function parseKvFilterValue(raw) {
    // Purpose: mirror backend KV query parsing (bool/number/null/JSON/string) for additive filtering.
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s.startsWith("{") || s.startsWith("[") || (s.startsWith('"') && s.endsWith('"'))) {
      try {
        return JSON.parse(s);
      } catch {
        // fall through to string
      }
    }
    return s;
  }

  function pageMatchesFilters(p) {
    // Purpose: apply Recall tag/KV fields as additive filters to whatever "Related" produces.
    if (tag) {
      const tags = Array.isArray(p?.tags) ? p.tags : [];
      if (!tags.includes(tag)) return false;
    }
    if (kvKey || kvValue) {
      if ((kvKey && !kvValue) || (!kvKey && kvValue)) return false; // should be prevented earlier; keep consistent.
      const kv = p?.kv_tags;
      if (!kv || typeof kv !== "object" || Array.isArray(kv)) return false;
      const want = parseKvFilterValue(kvValue);
      const have = kv[String(kvKey)];
      if (have === undefined) return false;
      if (typeof have === "object") return JSON.stringify(have) === JSON.stringify(want);
      return have === want;
    }
    return true;
  }

  // If there is no chat text yet, just show recent assistant chat pages.
  if (!chatText) {
    if (matchers.time) {
      // If Time is enabled and there is no draft/search, show the most recent pages overall.
      // IMPORTANT: fetch non-light pages so we have content_md available for the title fallback UI.
      const data = await apiFetch(`/api/pages?limit=50`);
      const recent = (data.pages || []).map((p) => ({
        ...p,
        _enkidu_rel: { kind: "heuristic", score: p?.created_at ? new Date(p.created_at).getTime() : 0, textScore: 0 },
      }));
      renderRecallResults(recent);
      setStatus(`Related: showing ${recent.length} most recent pages.`, "success");
      dbg("recallSearch:related:emptyDraft", { requestSeq, mode: "time", recent: recent.length });
      return;
    }

    // Otherwise, keep the older behavior: show recent chat pages.
    // IMPORTANT: fetch non-light pages so we have content_md available for the title fallback UI.
    // Oversample a bit so we can filter out internal tool bubbles.
    const data = await apiFetch(`/api/pages?limit=200&tag=${encodeURIComponent("*chat")}`);
    const candidates = (data.pages || []).filter(
      (p) =>
        (p?.kv_tags?.role === "assistant" || p?.kv_tags?.role === "user") && (p?.tags || []).includes("*chat")
    );
    const recent = candidates.slice(0, 50);
    renderRecallResults(recent);
    setStatus(`Related: showing ${recent.length} recent chat pages.`, "success");
    dbg("recallSearch:related:emptyDraft", { requestSeq, mode: "chat", recent: recent.length });
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
  //   and include everything (no tag-based exclusion).
  const candidates = matchers.title
    ? pages
    : pages.filter(
        (p) =>
          (p?.kv_tags?.role === "assistant" || p?.kv_tags?.role === "user") && (p?.tags || []).includes("*chat")
      );
  const filteredCandidates = hasFilters ? candidates.filter(pageMatchesFilters) : candidates;
  dbg("recallSearch:candidates", {
    requestSeq,
    candidates: filteredCandidates.length,
    queryTokens: queryTokens.length,
    scope: matchers.title ? "all-pages" : "chat-only",
  });

  function recencyScore(createdAt) {
    const ts = createdAt ? new Date(createdAt).getTime() : 0;
    return ts;
  }

  const useHeuristic = matchers.time || matchers.text || matchers.title;
  const scored = useHeuristic
    ? filteredCandidates
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
    const embRaw = await loadEmbeddingsRelated(hasFilters ? 200 : haveHeuristic ? 25 : 50);
    if (requestSeq !== relatedRequestSeq) return; // stale (user typed again)
    const emb = hasFilters ? (embRaw || []).filter(pageMatchesFilters).slice(0, 50) : embRaw;
    const embIds = new Set((emb || []).map((p) => p.id));
    const merged = haveHeuristic ? [...(emb || []), ...topHeuristic.filter((p) => !embIds.has(p.id))].slice(0, 50) : emb || [];
    renderRecallResults(merged);
    setStatus(`Related: showing ${merged.length} pages.`, "success");
    dbg("recallSearch:final", {
      requestSeq,
      mode: haveHeuristic ? "embeddings+heuristic" : "embeddings-only",
      merged: merged.length,
      emb: (emb || []).length,
      heuristic: topHeuristic.length,
    });
  } catch (e) {
    if (requestSeq !== relatedRequestSeq) return;
    setStatus(String(e.message || e), "danger");
    dbg("recallSearch:error", { requestSeq, error: String(e?.message || e) });
  }
}

async function savePage({ reason = "manual" } = {}) {
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

  setStatus(reason === "autosave" ? "Autosaving..." : "Saving...", "secondary");

  if (!selectedPageId) {
    const data = await apiFetch("/api/pages", { method: "POST", body: payload });
    if (reason === "autosave") {
      // Purpose: autosave should not "refresh" the editor by re-filling inputs.
      // Just attach the new page id so further autosaves become updates.
      selectedPageId = data?.page?.id || null;
      $("pageId").textContent = selectedPageId || "(none)";
      if (reason === "autosave") setStatus("Autosaved (created).", "success");
      else setStatus("Saved (created).", "success");
    } else {
      setSelectedPage(data.page);
      setStatus("Saved (created).", "success");
    }
    invalidatePagesCache({ reason: "savePage:create" });
    await recallSearch();
    return;
  }

  const data = await apiFetch(`/api/page?id=${encodeURIComponent(selectedPageId)}`, {
    method: "PUT",
    body: payload,
  });
  if (reason === "autosave") {
    // Purpose: keep user on the existing page; don't overwrite textboxes during autosave.
    setStatus("Autosaved.", "success");
  } else {
    setSelectedPage(data.page);
    setStatus("Saved.", "success");
  }
  invalidatePagesCache({ reason: "savePage:update" });
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
  setSelectedPage(null, { newMode: false });
  invalidatePagesCache({ reason: "deletePage" });
  setStatus("Deleted.", "success");
  await recallSearch();
}

// -------------------------
// Chat panel
// -------------------------

function makeChatMsgDiv(p, { pending = false } = {}) {
  // Purpose: single canonical builder for a chat message bubble (used by both render + optimistic append).
  const role = p?.kv_tags?.role || "user";
  const div = document.createElement("div");
  div.className = `enkidu-msg ${role === "assistant" ? "enkidu-msg-assistant" : "enkidu-msg-user"}`;
  if (pending) div.classList.add("opacity-75");

  const head = document.createElement("div");
  head.className = "small text-secondary mb-1";
  head.textContent = `${role} — ${p?.created_at ? new Date(p.created_at).toLocaleString() : ""}`;

  const body = document.createElement("div");
  // Purpose: assistant replies are Markdown; render as HTML for readability.
  // NOTE: this renders HTML produced by `marked` (treat assistant content as untrusted).
  if (role === "assistant" && window.marked) {
    const unwrapped = unwrapEnkiduAgentEnvelope(p.content_md || "");
    const md = unwrapped != null ? unwrapped : (p.content_md || "");
    body.innerHTML = window.marked.parse(preprocessWikilinks(md));
    collapseJsonCodeBlocks(body);
    linkifyPageIdsInText(body);
  } else {
    body.textContent = p.content_md || "";
    linkifyPageIdsInText(body);
  }

  div.appendChild(head);
  div.appendChild(body);
  return div;
}

function appendChatMsg(p, { pending = false } = {}) {
  // Purpose: optimistic UI update (append one bubble without reloading the whole thread).
  const root = $("chatLog");
  const div = makeChatMsgDiv(p, { pending });
  root.appendChild(div);
  root.scrollTop = root.scrollHeight;
  return div;
}

function renderChatLog(pages) {
  const root = $("chatLog");
  root.innerHTML = "";

  const ordered = (pages || []).slice().reverse();
  for (const p of ordered) {
    root.appendChild(makeChatMsgDiv(p));
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
  const data = await apiFetch(`/api/pages?limit=100&thread_id=${encodeURIComponent(threadId)}&tag=*chat`);
  renderChatLog(data.pages);
  setStatus(`Loaded ${data.pages?.length || 0} messages.`, "success");
}

async function deleteThread() {
  // Purpose: delete the currently selected thread (all pages with this thread_id).
  const threadId = ($("threadSelect").value || "").trim();
  if (!threadId) {
    setStatus("Select a thread to delete.", "secondary");
    return;
  }

  if (!confirm("Delete this entire thread (all pages in it)?")) return;

  setStatus("Deleting thread...", "secondary");
  const data = await apiFetch(`/api/threads?thread_id=${encodeURIComponent(threadId)}&confirm=1`, { method: "DELETE" });

  // Clear UI state so we don't keep pointing at a deleted thread.
  $("threadSelect").value = "";
  $("chatLog").innerHTML = "";
  invalidatePagesCache({ reason: "deleteThread" });

  await loadThreads();
  await recallSearch();
  setStatus(`Deleted thread (${data?.deleted ?? "?"} pages).`, "success");
}

async function sendChat() {
  if (chatInFlight) return; // prevent overlapping sends
  const msg = $("chatInput").value || "";
  const threadId = ($("threadSelect").value || "").trim();
  if (!msg.trim()) return;

  // Purpose: optimistic UI update — show the user's bubble immediately (before waiting on the server).
  $("chatInput").value = "";
  refreshClearButtons();
  const optimisticEl = appendChatMsg(
    { content_md: msg, created_at: new Date().toISOString(), kv_tags: { role: "user" } },
    { pending: true }
  );
  setStatus("Sending...", "secondary");

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

  const model = $("chatModel").value || null;
  const use_web_search = !!$("useWebSearch")?.checked;
  const context_page_ids = Array.from(selectedPayloadIds);
  let data;
  setChatInFlight(true);
  try {
    data = await apiFetch("/api/chat", {
      method: "POST",
      body: { message: msg, thread_id: threadId || null, model, context_page_ids, use_web_search },
    });
  } catch (e) {
    // Purpose: if send fails, remove the optimistic bubble so the log matches reality.
    optimisticEl?.remove();
    throw e;
  } finally {
    setChatInFlight(false);
  }

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
  // Refresh Related/Recall after *any* response. Since the chat box is cleared, Related mode
  // will show most recent pages (when Time is enabled) or recent chat pages (when Time is off).
  await recallSearch();
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
  // Track "activity" broadly so background backfill only runs when you're idle.
  // (Keep it simple: any interaction resets the idle timer and aborts any in-flight auto-backfill.)
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "input", "focusin"]) {
    window.addEventListener(ev, markUserActivity, { passive: true });
  }

  initClearButtons();
  initKvTagsBuilder();
  $("adminToken").value = getToken();
  if ($("apiBaseUrl")) {
    $("apiBaseUrl").value = getApiBaseUrl();
    if (isLocalhostUi()) {
      // Local mode: show blank (same-origin). Keep input enabled so you can copy/paste, but it won't be used.
      $("apiBaseUrl").placeholder = "(local dev uses same origin)";
    }
  }
  refreshClearButtons();
  updatePayloadCount();
  // Default UI state: nothing selected until the user opens a page or clicks New page.
  setSelectedPage(null, { newMode: false });
  if ($("allowSecrets")) $("allowSecrets").checked = getAllowSecrets();
  if ($("useWebSearch")) $("useWebSearch").checked = getUseWebSearch();
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
  $("saveApiBase")?.addEventListener("click", () => {
    setApiBaseUrl(($("apiBaseUrl")?.value || "").trim());
    setStatus("API base saved. Reloading models/threads...", "success");
    invalidatePagesCache({ reason: "apiBaseChanged" });
    loadModels().catch(() => {});
    loadThreads().catch(() => {});
    ensureRecentPagesCache().catch(() => {});
  });
  $("allowSecrets")?.addEventListener("change", () => {
    setAllowSecrets(!!$("allowSecrets").checked);
  });
  $("useWebSearch")?.addEventListener("change", () => {
    setUseWebSearch(!!$("useWebSearch").checked);
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
  $("newPage").onclick = () => setSelectedPage(null, { newMode: true });
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
  // Save button removed; Recall editor uses debounced autosave.
  $("deletePage").onclick = () => deletePage().catch((e) => setStatus(e.message, "danger"));
  $("pageTitle")?.addEventListener("input", scheduleAutosave);
  $("pageTags")?.addEventListener("input", scheduleAutosave);
  $("pageKvTags")?.addEventListener("input", () => {
    kvTagsRefreshFromTextarea();
    scheduleAutosave();
  });
  $("pageContent").addEventListener("input", () => {
    // While editing, keep preview up-to-date (even if hidden).
    renderPreview();
    // Wikilink picker in markdown editor.
    openOrUpdateWikilinkPicker($("pageContent")).catch(() => {});
    scheduleAutosave();
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
    if (previewClickTimer) clearTimeout(previewClickTimer);
    isEditingMarkdown = true;
    syncMarkdownWidget();
    $("pageContent").focus();
  });

  $("sendChat").onclick = () => sendChat().catch((e) => setStatus(e.message, "danger"));
  $("searchLocal").onclick = () => recallSearch().catch((e) => setStatus(e.message, "danger"));
  $("chatInput").addEventListener("keydown", (e) => {
    handleWikilinkKeydown(e);
    if (e.defaultPrevented) return; // wikilink picker consumed the key (e.g. Enter to select)
    // Enter submits; Shift+Enter inserts newline (since this is a textarea).
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      recallSearch().catch((err) => setStatus(err.message, "danger"));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat().catch((err) => setStatus(err.message, "danger"));
    }
  });
  $("chatInput").addEventListener("input", () => {
    dbg("chatInput:input", { len: ($("chatInput")?.value || "").length, searchActive: isRecallSearchActive() });

    // Wikilink picker in chat box.
    openOrUpdateWikilinkPicker($("chatInput")).catch(() => {});
  });

  // Click wikilinks in previews/chat to open pages.
  $("pagePreview")?.addEventListener("click", (e) => {
    const idLink = e.target?.closest?.("a.enkidu-page-id");
    if (idLink) {
      e.preventDefault();
      e.stopPropagation();
      openPageById(idLink.dataset.pageId).catch((err) => setStatus(err.message, "danger"));
      return;
    }
    const a = e.target?.closest?.("a.enkidu-wikilink");
    if (a) {
      e.preventDefault();
      openPageByTitle(a.dataset.wikilinkTitle).catch((err) => setStatus(err.message, "danger"));
      return;
    }

    // Single click opens modal; delay so dblclick can cancel it.
    if (previewClickTimer) clearTimeout(previewClickTimer);
    previewClickTimer = setTimeout(() => {
      previewClickTimer = null;
      openPreviewModal();
    }, 240);
  });
  $("enkiduPreviewModalBody")?.addEventListener("click", (e) => {
    const idLink = e.target?.closest?.("a.enkidu-page-id");
    if (idLink) {
      e.preventDefault();
      e.stopPropagation();
      openPageById(idLink.dataset.pageId).catch((err) => setStatus(err.message, "danger"));
      return;
    }
    const a = e.target?.closest?.("a.enkidu-wikilink");
    if (a) {
      e.preventDefault();
      e.stopPropagation();
      openPageByTitle(a.dataset.wikilinkTitle).catch((err) => setStatus(err.message, "danger"));
      return;
    }
  });
  $("chatLog")?.addEventListener("click", (e) => {
    const idLink = e.target?.closest?.("a.enkidu-page-id");
    if (idLink) {
      e.preventDefault();
      e.stopPropagation(); // avoid toggling <details> when clicking page-id chips in <summary>
      openPageById(idLink.dataset.pageId).catch((err) => setStatus(err.message, "danger"));
      return;
    }

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

  // Preview modal close wiring.
  $("enkiduPreviewModalClose")?.addEventListener("click", () => closePreviewModal());
  $("enkiduPreviewModal")?.addEventListener("click", (e) => {
    // Click outside closes (backdrop only).
    if (e.target?.id === "enkiduPreviewModal") closePreviewModal();
  });
  document.addEventListener("keydown", (e) => {
    // Global keyboard shortcuts (only when NOT typing in a text box).
    const modal = $("enkiduPreviewModal");

    // Escape: close the preview modal (regardless of focus).
    if (e.key === "Escape") {
      if (modal && !modal.classList.contains("d-none")) closePreviewModal();
      return;
    }

    // If another handler already consumed this key, do nothing.
    if (e.defaultPrevented) return;

    // Only fire these shortcuts when focus isn't in a text entry control.
    const active = document.activeElement;
    const isTyping =
      isTextEntryControl(active) ||
      !!active?.isContentEditable ||
      !!active?.closest?.("[contenteditable='true']");
    if (isTyping) return;

    // Avoid colliding with browser/app shortcuts.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    async function openAdjacentVisiblePage(delta) {
      // Purpose: j/k navigate the currently visible Recall list.
      const ids = getVisibleRecallIds();
      if (!ids.length) return;
      let idx = selectedPageId ? ids.indexOf(selectedPageId) : -1;
      if (idx === -1) idx = delta > 0 ? -1 : ids.length;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= ids.length) return;
      await openPageById(ids[nextIdx]);
    }

    if (e.key === "Delete" || e.key === "y") {
      e.preventDefault();
      deletePage().catch((err) => setStatus(err.message, "danger"));
      return;
    }
    if (e.key === "j") {
      e.preventDefault();
      openAdjacentVisiblePage(+1).catch((err) => setStatus(err.message, "danger"));
      return;
    }
    if (e.key === "k") {
      e.preventDefault();
      openAdjacentVisiblePage(-1).catch((err) => setStatus(err.message, "danger"));
      return;
    }
    if (e.key === "/" && !e.shiftKey) {
      e.preventDefault();
      $("chatInput")?.focus();
      return;
    }
    if (e.key === "t") {
      e.preventDefault();
      $("recallTag")?.focus();
      return;
    }
    if (e.key === "x") {
      // Purpose: toggle the payload checkbox for the currently open page (if visible in Related).
      e.preventDefault();
      if (!selectedPageId) return;
      const root = $("recallResults");
      const cb = root?.querySelector?.(`input[type="checkbox"][data-page-id="${selectedPageId}"]`);
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (e.key === "n") {
      // Purpose: new thread shortcut (matches the UI button).
      e.preventDefault();
      newThread();
      $("chatInput")?.focus();
      return;
    }
    if (e.key === "w") {
      // Purpose: toggle Web search on/off (matches the existing toggle + persistence).
      e.preventDefault();
      const el = $("useWebSearch");
      if (!el) return;
      el.checked = !el.checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  });
  $("reloadChat").onclick = () => reloadThread().catch((e) => setStatus(e.message, "danger"));
  $("newThread").onclick = () => newThread();
  $("deleteThread")?.addEventListener("click", () => deleteThread().catch((e) => setStatus(e.message, "danger")));
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

  $("adminToken").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("saveToken").click();
    }
  });

  // Clip/bookmarklet support: fill a new page from URL params and auto-save if token is present.
  (async () => {
    const clip = readClipParams();
    if (!clip) return;

    // Prevent duplicate creates if the page loads more than once with the same clip params.
    const clipKey = String(clip.clip_id || "").trim() || `${clip.url}||${clip.title}||${clip.text}`.slice(0, 4000);
    const seenKey = `enkidu_clip_seen:${clipKey}`;
    if (sessionStorage.getItem(seenKey) === "1") {
      clearClipParamsFromUrl();
      dbg("clip:skip-duplicate", { clipKeyLen: clipKey.length });
      return;
    }
    sessionStorage.setItem(seenKey, "1");

    // Fill editor first (so even if save fails you don't lose the clip).
    const url = String(clip.url || "").slice(0, 2000);
    const title = String(clip.title || "").slice(0, 200) || url || "(clip)";
    const text = String(clip.text || "").slice(0, 8000);

    setSelectedPage(null, { newMode: true });
    $("pageTitle").value = title;
    $("pageTags").value = Array.from(new Set([...parseTags($("pageTags").value), "clip", "web"])).join(", ");
    $("pageKvTags").value = JSON.stringify({ source_url: url }, null, 2);
    kvTagsRefreshFromTextarea();

    const quote = text
      ? `> ${text.trim().replace(/\n/g, "\n> ")}\n\n`
      : "";
    $("pageContent").value = `# ${title}\n\nSource: ${url}\n\n${quote}`;
    isEditingMarkdown = false;
    syncMarkdownWidget();
    refreshClearButtons();

    // Prevent repeat-creation on refresh.
    clearClipParamsFromUrl();

    if (!getToken()) {
      setStatus("Clip ready. Paste admin token and click Save.", "warning");
      return;
    }

    try {
      await savePage();
      setStatus("Clipped page saved.", "success");
    } catch (e) {
      setStatus(String(e.message || e), "danger");
    }
  })();

  // Try initial load if token exists.
  if (getToken()) {
    recallSearch().catch(() => {});
    loadModels().catch(() => {});
    (async () => {
      await loadThreads();
      // Purpose: on reload, default to most recent chat thread (first option after "(new thread)").
      const sel = $("threadSelect");
      const mostRecent = sel?.options?.[1]?.value || "";
      if (mostRecent) {
        sel.value = mostRecent;
        await reloadThread();
      }
    })().catch(() => {});
    ensureRecentPagesCache().catch(() => {});
  }

  // Always start status polling (it will show "(no token)" until token is saved).
  startEmbeddingStatusPoll();

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
  if (dreamInFlight) return;
  dreamInFlight = true;
  try {
    setStatus("Dreaming...", "secondary");
    const data = await apiFetch("/api/dream", { method: "POST", body: { limit: 8 } });
    // Refresh caches and UI lists after the dream changed some pages.
    invalidatePagesCache({ reason: "dream" });
    await recallSearch();
    const msg =
      data && typeof data === "object"
        ? `Dream done. Candidates ${data.candidates ?? "?"}, proposed ${data.proposed ?? "?"}, updated ${data.updated ?? 0}. Diary: ${data.diaryPageId || "(none)"}.`
        : "Dream done.";
    setStatus(msg, "success");
  } finally {
    dreamInFlight = false;
  }
}

init();


