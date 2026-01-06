// Enkidu frontend (vanilla JS).
// Purpose: minimal chat + recall UI talking to Netlify Functions.

const LS_TOKEN_KEY = "enkidu_admin_token";

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

async function apiFetch(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
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

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// -------------------------
// Recall panel
// -------------------------

let selectedPageId = null;

function renderPreview() {
  const md = $("pageContent").value || "";
  $("pagePreview").innerHTML = window.marked ? window.marked.parse(md) : md;
}

function setSelectedPage(page) {
  selectedPageId = page?.id || null;
  $("pageId").textContent = selectedPageId || "(none)";
  $("pageTitle").value = page?.title || "";
  $("pageTags").value = (page?.tags || []).join(", ");
  $("pageContent").value = page?.content_md || "";
  renderPreview();
}

function renderRecallResults(pages) {
  const root = $("recallResults");
  root.innerHTML = "";

  for (const p of pages || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-light w-100 text-start mb-1";
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
    root.appendChild(btn);
  }
}

async function recallSearch() {
  const q = $("recallQuery").value || "";
  setStatus("Searching...", "secondary");
  const data = await apiFetch(`/api/pages?limit=50&q=${encodeURIComponent(q)}`);
  renderRecallResults(data.pages);
  setStatus(`Found ${data.pages?.length || 0} pages.`, "success");
}

async function savePage() {
  const payload = {
    title: $("pageTitle").value || null,
    tags: parseTags($("pageTags").value),
    content_md: $("pageContent").value || "",
    kv_tags: {}, // keep UI simple for now
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
    body.textContent = p.content_md || "";

    div.appendChild(head);
    div.appendChild(body);
    root.appendChild(div);
  }

  root.scrollTop = root.scrollHeight;
}

async function reloadThread() {
  const threadId = ($("threadId").value || "").trim();
  if (!threadId) {
    setStatus("Enter a thread id (or start chatting to create one).", "secondary");
    return;
  }

  setStatus("Loading thread...", "secondary");
  const data = await apiFetch(`/api/pages?limit=100&thread_id=${encodeURIComponent(threadId)}&tag=chat`);
  renderChatLog(data.pages);
  setStatus(`Loaded ${data.pages?.length || 0} messages.`, "success");
}

async function sendChat() {
  const msg = $("chatInput").value || "";
  const threadId = ($("threadId").value || "").trim();
  if (!msg.trim()) return;

  $("chatInput").value = "";
  setStatus("Sending...", "secondary");

  const data = await apiFetch("/api/chat", {
    method: "POST",
    body: { message: msg, thread_id: threadId || null },
  });

  $("threadId").value = data.thread_id;
  await reloadThread();
  setStatus("Replied.", "success");
}

function newThread() {
  $("threadId").value = "";
  $("chatLog").innerHTML = "";
  setStatus("New thread. Send a message to create it.", "secondary");
}

// -------------------------
// Init wiring
// -------------------------

function init() {
  $("adminToken").value = getToken();

  $("saveToken").onclick = () => {
    setToken(($("adminToken").value || "").trim());
    setStatus("Token saved. Try search or chat.", "success");
  };

  $("recallSearch").onclick = () => recallSearch().catch((e) => setStatus(e.message, "danger"));
  $("newPage").onclick = () => setSelectedPage(null);
  $("savePage").onclick = () => savePage().catch((e) => setStatus(e.message, "danger"));
  $("deletePage").onclick = () => deletePage().catch((e) => setStatus(e.message, "danger"));
  $("pageContent").addEventListener("input", renderPreview);

  $("sendChat").onclick = () => sendChat().catch((e) => setStatus(e.message, "danger"));
  $("reloadChat").onclick = () => reloadThread().catch((e) => setStatus(e.message, "danger"));
  $("newThread").onclick = () => newThread();

  // Try initial load if token exists.
  if (getToken()) {
    recallSearch().catch(() => {});
  }
}

init();


