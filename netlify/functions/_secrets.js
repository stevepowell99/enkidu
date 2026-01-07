// Secret detection (very simple heuristics).
// Purpose: prevent accidental storage of high-entropy secrets in pages.

const COMMON_PREFIXES = [
  "AIza", // Google API keys often start like this
  "sk-", // OpenAI
  "ghp_", // GitHub
  "github_pat_", // GitHub
  "xoxb-", // Slack bot
  "xoxa-", // Slack app
  "xoxp-", // Slack user
  "xapp-", // Slack
];

function findLikelySecret(text) {
  if (!text) return null;

  // 1) Common prefixes
  for (const p of COMMON_PREFIXES) {
    if (text.includes(p)) return `Found token prefix "${p}"`;
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


