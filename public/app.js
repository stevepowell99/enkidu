// Enkidu frontend (vanilla JS).
// Purpose: minimal chat + recall UI talking to Netlify Functions.

const LS_TOKEN_KEY = "enkidu_admin_token";
const LS_ALLOW_SECRETS_KEY = "enkidu_allow_secrets";
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
  return localStorage.getItem(LS_ALLOW_SECRETS_KEY) === "1";
}

function setAllowSecrets(on) {
  localStorage.setItem(LS_ALLOW_SECRETS_KEY, on ? "1" : "0");
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
let relatedMode = "heuristic"; // "heuristic" (default) | "embeddings" (on-demand)

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
    cb.checked = selectedPayloadIds.has(p.id);
    cb.onchange = () => {
      if (cb.checked) selectedPayloadIds.add(p.id);
      else selectedPayloadIds.delete(p.id);
      updatePayloadCount();
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
  const preset = $("relatedPreset").value || "mixed";

  setStatus("Loading related pages...", "secondary");

  // If there is no chat text yet, just show recent assistant chat pages.
  if (!chatText) {
    relatedMode = "heuristic"; // reset after empty input
    const pages = await ensureRecentPagesCache();
    const candidates = pages.filter(
      (p) => (p?.kv_tags?.role === "assistant" || p?.kv_tags?.role === "user") && (p?.tags || []).includes("chat")
    );
    const recent = candidates.slice(0, 50);
    renderRecallResults(recent);
    setStatus(`Related: showing ${recent.length} recent answers.`, "success");
    return;
  }

  // Embeddings mode is on-demand (button), to avoid costs/timeouts while typing.
  if (relatedMode === "embeddings") {
    const data = await apiFetch(`/api/pages?limit=50&related_to=${encodeURIComponent(chatText)}`);
    renderRecallResults(data.pages);
    setStatus(`Related: showing ${data.pages?.length || 0} most similar pages (embeddings).`, "success");
    relatedMode = "heuristic"; // one-shot
    return;
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

  const top = scored.slice(0, 50).map((x) => x.p);
  renderRecallResults(top);
  setStatus(`Related: showing ${top.length} similar pages.`, "success");
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
  if (!selectedPageId) return;
  if (!confirm("Delete this page?")) return;

  setStatus("Deleting...", "secondary");
  await apiFetch(`/api/page?id=${encodeURIComponent(selectedPageId)}`, { method: "DELETE" });
  setSelectedPage(null);
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
  const context_page_ids = Array.from(selectedPayloadIds);
  const data = await apiFetch("/api/chat", {
    method: "POST",
    body: { message: msg, thread_id: threadId || null, model, context_page_ids },
  });

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

  $("recallSearch").onclick = () => recallSearch().catch((e) => setStatus(e.message, "danger"));
  $("relatedPreset").addEventListener("change", () => {
    if (($("recallQuery").value || "").trim() || ($("recallTag").value || "").trim()) return;
    recallSearch().catch(() => {});
  });
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
    if (($("recallQuery").value || "").trim()) return;
    if (relatedDebounce) clearTimeout(relatedDebounce);
    relatedDebounce = setTimeout(() => {
      recallSearch().catch(() => {});
    }, 800);
  });
  $("findSimilar").onclick = () => {
    // Purpose: on-demand embeddings-based similarity (avoids constant embedding calls while typing).
    relatedMode = "embeddings";
    recallSearch().catch((e) => setStatus(e.message, "danger"));
  };
  $("reloadChat").onclick = () => reloadThread().catch((e) => setStatus(e.message, "danger"));
  $("newThread").onclick = () => newThread();
  $("threadSelect").addEventListener("change", () => {
    reloadThread().catch((e) => setStatus(e.message, "danger"));
  });
  $("clearPayload").onclick = () => {
    selectedPayloadIds.clear();
    updatePayloadCount();
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


