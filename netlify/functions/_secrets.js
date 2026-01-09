// Secret detection (very simple heuristics).
// Purpose: prevent accidental storage of high-entropy secrets in pages.

// Token patterns (keep simple, avoid false positives like "risk-mapping" containing "sk-").
// Purpose: catch *actual* secrets without blocking normal prose.
const TOKEN_PATTERNS = [
  // Google API keys: AIza... (usually 39 chars total)
  { name: "AIza", re: /\bAIza[0-9A-Za-z\-_]{20,}\b/ },
  // OpenAI keys: sk-<long>
  { name: "sk-", re: /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9]{20,}\b/ },
  // GitHub classic PAT: ghp_<long>
  { name: "ghp_", re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  // GitHub fine-grained PAT: github_pat_<long>
  { name: "github_pat_", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  // Slack tokens
  { name: "xoxb-", re: /\bxoxb-[A-Za-z0-9-]{10,}\b/ },
  { name: "xoxa-", re: /\bxoxa-[A-Za-z0-9-]{10,}\b/ },
  { name: "xoxp-", re: /\bxoxp-[A-Za-z0-9-]{10,}\b/ },
  { name: "xapp-", re: /\bxapp-[A-Za-z0-9-]{10,}\b/ },
];

function findLikelySecret(text) {
  if (!text) return null;

  // 1) Common token patterns
  for (const p of TOKEN_PATTERNS) {
    if (p.re.test(text)) return `Found token pattern "${p.name}"`;
  }

  // 2) Very long hex/base64-ish runs (high entropy blobs)
  // Keep this intentionally conservative to avoid false positives.
  const longHex = text.match(/\b[a-f0-9]{48,}\b/i);
  if (longHex) return "Found long hex-like token (>=48 chars)";

  const longB64 = text.match(/\b[A-Za-z0-9+/]{60,}={0,2}\b/);
  if (longB64) return "Found long base64-like token (>=60 chars)";

  return null;
}

function isAllowSecrets(event) {
  // Purpose: optional override for false positives.
  // Frontend sends: x-enkidu-allow-secrets: "1"
  const h = event?.headers || {};
  const v = h["x-enkidu-allow-secrets"] || h["X-Enkidu-Allow-Secrets"] || "";
  return String(v).trim() === "1";
}

function assertNoSecrets(text, { allow = false } = {}) {
  if (allow) return;
  const reason = findLikelySecret(text);
  if (reason) {
    const err = new Error(`Refusing to save content: possible secret detected. (${reason})`);
    err.code = "ENKIDU_SECRET_DETECTED";
    throw err;
  }
}

module.exports = { assertNoSecrets, findLikelySecret, isAllowSecrets };


