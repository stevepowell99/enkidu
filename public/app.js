// Enkidu frontend (vanilla JS).
// Purpose: minimal chat + recall UI talking to Netlify Functions.

const LS_TOKEN_KEY = "enkidu_admin_token";
const LS_ALLOW_SECRETS_KEY = "enkidu_allow_secrets";
const LS_USE_WEB_SEARCH_KEY = "enkidu_use_web_search";
const DEFAULT_MODEL_ID = "gemini-3-flash-preview";

function $(id) {
  return document.getElementById(id);
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

function getRelatedPreset() {
  // Purpose: read the Related preset from the radio button group (default "mixed").
  return document.querySelector('input[name="relatedPreset"]:checked')?.value || "mixed";
}

function isRecallSearchActive() {
  // Purpose: if any recall search field is non-empty, we are in "search" mode (not "related").
  const q = ($("recallQuery")?.value || "").trim();
  const tag = ($("recallTag")?.value || "").trim();
  const kvKey = ($("recallKvKey")?.value || "").trim();
  const kvValue = ($("recallKvValue")?.value || "").trim();
  return !!(q || tag || kvKey || kvValue);
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

async function ensureRecentPagesCache() {
  if (recentPagesCache) return recentPagesCache;
  const data = await apiFetch(`/api/pages?limit=500`);
  recentPagesCache = data.pages || [];
  updateTagSuggestionsFromPages(recentPagesCache);
  return recentPagesCache;
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
  $("pagePreview").innerHTML = window.marked ? window.marked.parse(md) : md;
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
}

function renderRecallResults(pages) {
  const root = $("recallResults");
  root.innerHTML = "";

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
    btn.onclick = async () => {
      try {
        setStatus("Loading page...", "secondary");
        const one = await apiFetch(`/api/page?id=${encodeURIComponent(p.id)}`);
        setSelectedPage(one.page);
        setStatus("Page loaded.", "success");
      } catch (e) {
        setStatus(String(e.message || e), "danger");
      }
    };

    row.appendChild(cb);
    row.appendChild(btn);
    root.appendChild(row);
  }

  updateRelatedToggleLabel();
}

async function recallSearch() {
  const q = ($("recallQuery").value || "").trim();
  const tag = ($("recallTag").value || "").trim();
  const kvKey = ($("recallKvKey")?.value || "").trim();
  const kvValue = ($("recallKvValue")?.value || "").trim();

  // If user typed a recall query, use server search.
  if (q || tag || kvKey || kvValue) {
    if ((kvKey && !kvValue) || (!kvKey && kvValue)) {
      throw new Error("KV filter requires both key and value");
    }
    setStatus("Searching...", "secondary");
    const params = [];
    params.push("limit=50");
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
    if (kvKey) params.push(`kv_key=${encodeURIComponent(kvKey)}`);
    if (kvValue) params.push(`kv_value=${encodeURIComponent(kvValue)}`);
    const data = await apiFetch(`/api/pages?${params.join("&")}`);
    renderRecallResults(data.pages);
    setStatus(`Found ${data.pages?.length || 0} pages.`, "success");
    return;
  }

  // Otherwise: "related pages" mode based on current chatbox text.
  const chatText = ($("chatInput").value || "").trim();
  const preset = getRelatedPreset();

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
    return;
  }

  async function loadEmbeddingsRelated(limit = 50) {
    // Purpose: server-side semantic similarity using pgvector.
    const data = await apiFetch(`/api/pages?limit=${encodeURIComponent(limit)}&related_to=${encodeURIComponent(chatText)}`);
    return data.pages || [];
  }

  const queryTokens = tokenize(chatText).slice(0, 40);
  const pages = await ensureRecentPagesCache();

  // Prefer older answers (assistant chat) before the user sends anything.
  const candidates = pages.filter(
    (p) => (p?.kv_tags?.role === "assistant" || p?.kv_tags?.role === "user") && (p?.tags || []).includes("chat")
  );

  function tagOverlapScore(tokens, pageTags) {
    const set = new Set((pageTags || []).map((t) => String(t).toLowerCase()));
    let hit = 0;
    for (const t of tokens) if (set.has(t)) hit++;
    return hit;
  }

  function recencyScore(createdAt) {
    const ts = createdAt ? new Date(createdAt).getTime() : 0;
    return ts;
  }

  const scored = candidates
    .map((p) => {
      const textScore = scoreOverlap(queryTokens, p.content_md || "");
      const tagsScore = tagOverlapScore(queryTokens, p.tags || []);
      const timeScore = recencyScore(p.created_at);

      let score = 0;
      if (preset === "time") score = timeScore;
      else if (preset === "tags") score = tagsScore;
      else if (preset === "text") score = textScore;
      else score = textScore * 3 + tagsScore * 8 + (timeScore / 1e12); // mixed: mostly similarity, slight recency

      return { p, score };
    })
    .filter((x) => x.score > 0 || preset === "time")
    .sort((a, b) => b.score - a.score);

  const topHeuristic = scored.slice(0, 50).map((x) => x.p);

  if (preset === "embeddings") {
    const emb = await loadEmbeddingsRelated(50);
    renderRecallResults(emb);
    setStatus(`Related: showing ${emb.length} most similar pages (embeddings).`, "success");
    return;
  }

  if (preset === "mixed") {
    const emb = await loadEmbeddingsRelated(25);
    const embIds = new Set(emb.map((p) => p.id));
    const merged = [...emb, ...topHeuristic.filter((p) => !embIds.has(p.id))].slice(0, 50);
    renderRecallResults(merged);
    setStatus(`Related: showing ${merged.length} pages (mixed).`, "success");
    return;
  }

  renderRecallResults(topHeuristic);
  setStatus(`Related: showing ${topHeuristic.length} similar pages.`, "success");
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
    if (role === "assistant" && window.marked) body.innerHTML = window.marked.parse(p.content_md || "");
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

  $("chatInput").value = "";
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
  $("adminToken").value = getToken();
  updatePayloadCount();
  if ($("allowSecrets")) $("allowSecrets").checked = getAllowSecrets();
  if ($("useWebSearch")) $("useWebSearch").checked = getUseWebSearch();

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
  for (const el of document.querySelectorAll('input[name="relatedPreset"]')) {
    el.addEventListener("change", () => {
      if (isRecallSearchActive()) return;
      recallSearch().catch(() => {});
    });
  }
  $("recallQuery").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      recallSearch().catch((err) => setStatus(err.message, "danger"));
    }
  });
  // Live search (debounced) for text + tag fields.
  let recallDebounce = null;
  function liveRecall() {
    if (recallDebounce) clearTimeout(recallDebounce);
    recallDebounce = setTimeout(() => recallSearch().catch(() => {}), 200);
  }
  $("recallQuery").addEventListener("input", liveRecall);
  $("recallTag").addEventListener("input", liveRecall);
  $("recallKvKey")?.addEventListener("input", liveRecall);
  $("recallKvValue")?.addEventListener("input", liveRecall);
  $("newPage").onclick = () => setSelectedPage(null);
  $("newSystemCard").onclick = () =>
    newCard(["system", "preference"], "System prompt", ``);
  $("newStyleCard").onclick = () =>
    newCard(["style", "preference"], "Style", ``);
  $("newBioCard").onclick = () => newCard(["bio", "preference"], "Bio", ``);
  $("newStrategyCard").onclick = () =>
    newCard(["strategy", "preference"], "Strategy", ``);
  $("newDreamCard").onclick = () =>
    newCard(["dream-prompt", "preference"], "Dream prompt", ``);
  $("newSplitCard").onclick = () =>
    newCard(["split-prompt", "preference"], "Split prompt", ``);
  $("savePage").onclick = () => savePage().catch((e) => setStatus(e.message, "danger"));
  $("deletePage").onclick = () => deletePage().catch((e) => setStatus(e.message, "danger"));
  $("pageContent").addEventListener("input", () => {
    // While editing, keep preview up-to-date (even if hidden).
    renderPreview();
  });
  $("pageContent").addEventListener("blur", () => {
    // Leave edit mode on blur.
    isEditingMarkdown = false;
    syncMarkdownWidget();
  });
  $("pagePreview").addEventListener("dblclick", () => {
    // Enter edit mode on double-click.
    isEditingMarkdown = true;
    syncMarkdownWidget();
    $("pageContent").focus();
  });

  $("sendChat").onclick = () => sendChat().catch((e) => setStatus(e.message, "danger"));
  $("chatInput").addEventListener("keydown", (e) => {
    // Enter submits; Shift+Enter inserts newline (since this is a textarea).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat().catch((err) => setStatus(err.message, "danger"));
    }
  });
  $("chatInput").addEventListener("input", () => {
    // While recallQuery is empty, keep the related pages list synced to chat input.
    if (isRecallSearchActive()) return;
    if (relatedDebounce) clearTimeout(relatedDebounce);
    relatedDebounce = setTimeout(() => {
      recallSearch().catch(() => {});
    }, 800);
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

function newCard(tags, title, content) {
  setSelectedPage(null);
  $("pageTags").value = tags.join(", ");
  $("pageTitle").value = title || "";
  $("pageKvTags").value = "{}";
  $("pageContent").value = content || "";
  isEditingMarkdown = false;
  syncMarkdownWidget();
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


