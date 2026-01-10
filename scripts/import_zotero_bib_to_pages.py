#!/usr/bin/env python3
"""
Import a Zotero BibTeX (.bib) export into `public.pages` via the existing Netlify API.

What it does (minimal + targeted):
- Parses Zotero-style BibTeX entries (no third-party deps).
- Creates ONE page per entry using POST /api/pages:
  - tags: ["zotero"]
  - kv_tags: { source: "zotero", zotero_citekey: "...", ...all BibTeX fields... }
  - title: "<year> - <sanitised title> — <authors>"
  - content_md: file:// link (if present) + abstract/notes as the main body

Requirements (env vars):
- ENKIDU_BASE_URL (e.g. https://enkidu-agent.netlify.app or http://localhost:8888)
- ENKIDU_ADMIN_TOKEN (same token you paste into the UI)

Optional:
- ENKIDU_ALLOW_SECRETS="1" (passes x-enkidu-allow-secrets: 1 header)

Usage (PowerShell):
  python scripts/import_zotero_bib_to_pages.py "C:/Users/Zoom/Zotero-cm/My Library.bib"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from _dotenv import load_repo_dotenv


def _env_required(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise RuntimeError(f"Missing {name}")
    return v


def _http_json(
    *,
    url: str,
    method: str,
    headers: dict[str, str],
    body_obj: dict[str, Any] | None = None,
) -> Any:
    return _http(url=url, method=method, headers=headers, body_obj=body_obj, parse_json=True)


def _http_text(
    *,
    url: str,
    method: str,
    headers: dict[str, str],
    body_obj: dict[str, Any] | None = None,
) -> str:
    return str(_http(url=url, method=method, headers=headers, body_obj=body_obj, parse_json=False) or "")


def _http(
    *,
    url: str,
    method: str,
    headers: dict[str, str],
    body_obj: dict[str, Any] | None,
    parse_json: bool,
) -> Any:
    data = None
    if body_obj is not None:
        data = json.dumps(body_obj).encode("utf-8")
        headers = {**headers, "content-type": "application/json"}

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace").strip()
            if not parse_json:
                return raw
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err_txt = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API error {e.code}: {err_txt or e.reason}") from e


def _file_url_from_windows_path(p: str) -> str:
    # Convert "C:\Users\Me\file.pdf" -> "file:///C:/Users/Me/file.pdf"
    s = (p or "").strip().strip('"').strip()
    if not s:
        return ""
    s = s.replace("\\", "/")
    if re.match(r"^[A-Za-z]:/", s):
        s = "file:///" + s
    elif s.startswith("//"):  # UNC path
        s = "file:" + s
    else:
        # Best-effort: still try to make a file:// URL.
        s = "file:///" + s.lstrip("/")
    return urllib.parse.quote(s, safe=":/#?&=%")


def _split_zotero_file_field(file_field: str) -> list[str]:
    # Purpose: Zotero BibTeX `file` fields often contain:
    # - multiple attachments separated by ';'
    # - BibTeX-escaped Windows paths like: C\:\\Users\\Me\\file.pdf:application/pdf
    # We want clean per-attachment Windows paths like: C:\Users\Me\file.pdf
    raw = (file_field or "").strip()
    if not raw:
        return []

    parts = [p.strip() for p in raw.split(";") if p.strip()]
    out: list[str] = []
    for p in parts:
        s = p.strip().strip('"').strip()
        # Strip trailing MIME suffix (but keep the Windows drive colon).
        s = re.sub(r":[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$", "", s)
        # Unescape Zotero/BibTeX Windows path encoding.
        s = s.replace("\\:", ":").replace("\\\\", "\\")
        if s:
            out.append(s)
    return out


def _collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\r\n", "\n").replace("\r", "\n")).strip()


def _strip_braces(s: str) -> str:
    # Zotero titles often contain {…} for capitalization hints.
    return (s or "").replace("{", "").replace("}", "")


def _extract_year(fields: dict[str, str]) -> str:
    year = _collapse_ws(fields.get("year", ""))
    if year:
        m = re.search(r"\b(\d{4})\b", year)
        return m.group(1) if m else year
    date = _collapse_ws(fields.get("date", ""))
    m = re.search(r"\b(\d{4})\b", date)
    return m.group(1) if m else ""


def _authors_suffix(author_field: str) -> str:
    # Input often looks like: "Ackermann, Fran and Eden, Colin"
    raw = _collapse_ws(author_field)
    if not raw:
        return ""
    parts = [p.strip() for p in raw.split(" and ") if p.strip()]
    last_names: list[str] = []
    for p in parts:
        if "," in p:
            last = p.split(",", 1)[0].strip()
        else:
            toks = [t for t in p.split(" ") if t]
            last = toks[-1] if toks else p
        if last:
            last_names.append(last)
    if not last_names:
        return ""
    if len(last_names) == 1:
        return last_names[0]
    if len(last_names) == 2:
        return f"{last_names[0]} & {last_names[1]}"
    return f"{last_names[0]} et al."


def _page_title(fields: dict[str, str]) -> str:
    year = _extract_year(fields) or "????"
    title = _collapse_ws(_strip_braces(fields.get("title", ""))) or "Untitled"
    authors = _authors_suffix(fields.get("author", ""))
    if authors:
        return f"{year} - {title} — {authors}"
    return f"{year} - {title}"


def _body_markdown(fields: dict[str, str]) -> str:
    # Keep the "main body" as abstract/notes if present (per your request).
    abstract = _collapse_ws(fields.get("abstract", "") or fields.get("abstractnote", ""))
    notes = _collapse_ws(fields.get("note", "") or fields.get("annote", ""))

    lines: list[str] = []

    f_raw = fields.get("file", "") or ""
    f = _collapse_ws(f_raw)
    if f:
        files = _split_zotero_file_field(f)
        if files:
            lines.append("## Attachments")
            for i, path in enumerate(files, start=1):
                file_url = _file_url_from_windows_path(path)
                if not file_url:
                    continue
                lines.append(f"- [Open attachment {i}]({file_url})")
            lines.append("")

        # Keep the raw Zotero field for debugging/search (verbatim).
        lines.append(f"`{f}`")
        lines.append("")

    # Small metadata header (useful in Recall/search; keep it short).
    for k in ("author", "date", "year", "journaltitle", "booktitle", "publisher", "pages", "doi", "url", "keywords"):
        v = _collapse_ws(fields.get(k, ""))
        if v:
            lines.append(f"- **{k}**: {v}")
    if lines and not lines[-1].strip():
        pass
    else:
        lines.append("")

    if abstract:
        lines.append("## Abstract")
        lines.append(abstract)
        lines.append("")
    if notes:
        lines.append("## Notes")
        lines.append(notes)
        lines.append("")

    out = "\n".join(lines).strip()
    return out or "Imported from Zotero BibTeX."


@dataclass(frozen=True)
class BibEntry:
    entry_type: str
    citekey: str
    fields: dict[str, str]


class _BibScanner:
    def __init__(self, s: str):
        self.s = s
        self.n = len(s)
        self.i = 0

    def _peek(self) -> str:
        return self.s[self.i] if self.i < self.n else ""

    def _next(self) -> str:
        ch = self._peek()
        self.i += 1
        return ch

    def _skip_ws_and_commas(self) -> None:
        while self.i < self.n and self.s[self.i] in " \t\r\n,":
            self.i += 1

    def _read_ident(self) -> str:
        start = self.i
        while self.i < self.n and re.match(r"[A-Za-z0-9_\-]", self.s[self.i]):
            self.i += 1
        return self.s[start:self.i]

    def _read_until(self, stop_chars: str) -> str:
        start = self.i
        while self.i < self.n and self.s[self.i] not in stop_chars:
            self.i += 1
        return self.s[start:self.i]

    def _read_value(self, closing_char: str) -> str:
        ch = self._peek()
        if ch == "{":
            self._next()  # consume {
            depth = 1
            start = self.i
            while self.i < self.n:
                c = self._next()
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        return self.s[start : self.i - 1].strip()
            return self.s[start:self.i].strip()
        if ch == '"':
            self._next()  # consume "
            out = []
            while self.i < self.n:
                c = self._next()
                if c == "\\" and self.i < self.n:
                    out.append(c)
                    out.append(self._next())
                    continue
                if c == '"':
                    break
                out.append(c)
            return "".join(out).strip()
        # bare value: stop on comma or entry closing
        return self._read_until("," + closing_char).strip()


def parse_bibtex(text: str) -> list[BibEntry]:
    s = _BibScanner(text)
    out: list[BibEntry] = []

    while True:
        at = s.s.find("@", s.i)
        if at < 0:
            break
        s.i = at + 1

        entry_type = s._read_ident().lower()
        if not entry_type:
            continue
        s._skip_ws_and_commas()

        opener = s._peek()
        if opener not in "{(":
            continue
        closing = "}" if opener == "{" else ")"
        s._next()  # consume opener

        citekey = s._read_until(",").strip()
        if s._peek() == ",":
            s._next()

        fields: dict[str, str] = {}
        while True:
            s._skip_ws_and_commas()
            if s._peek() == closing:
                s._next()
                break
            name = s._read_ident().strip().lower()
            if not name:
                # Try to resync to end of entry.
                nxt = s.s.find(closing, s.i)
                s.i = s.n if nxt < 0 else nxt + 1
                break
            s._skip_ws_and_commas()
            if s._peek() != "=":
                # Invalid field, try next comma.
                s._read_until("," + closing)
                if s._peek() == ",":
                    s._next()
                continue
            s._next()  # consume =
            s._skip_ws_and_commas()
            val = s._read_value(closing_char=closing)
            fields[name] = _collapse_ws(val)
            s._skip_ws_and_commas()
            if s._peek() == ",":
                s._next()
                continue
            if s._peek() == closing:
                s._next()
                break

        if citekey:
            out.append(BibEntry(entry_type=entry_type, citekey=citekey, fields=fields))

    return out


def _stable_import_id(entry: BibEntry) -> str:
    # Deterministic id so reruns don't create duplicates.
    h = hashlib.sha1()
    h.update(entry.citekey.encode("utf-8", errors="replace"))
    h.update(b"\n---\n")
    h.update((entry.fields.get("title", "") + "\n" + entry.fields.get("date", "")).encode("utf-8", errors="replace"))
    return h.hexdigest()


def _source_hash(entry: BibEntry) -> str:
    # Purpose: detect changes in the BibTeX record so reruns can UPDATE existing pages.
    # Keep this stable: canonical JSON with sorted keys.
    payload = {
        "entry_type": entry.entry_type,
        "citekey": entry.citekey,
        "fields": {k: entry.fields.get(k, "") for k in sorted(entry.fields.keys())},
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8", errors="replace")
    return hashlib.sha1(raw).hexdigest()


def _chunked(xs: list[Any], n: int) -> list[list[Any]]:
    # Purpose: keep request size/time bounded for bulk API calls.
    if n <= 0:
        return [xs]
    return [xs[i : i + n] for i in range(0, len(xs), n)]


def main() -> int:
    p = argparse.ArgumentParser(description="Import Zotero BibTeX .bib into Enkidu pages via /api/pages.")
    p.add_argument("bib_path", type=Path, help="Path to Zotero .bib file")
    p.add_argument(
        "--purge-existing",
        action="store_true",
        help='Delete ALL existing pages where kv_tags.source == "zotero" before importing (dangerous).',
    )
    args = p.parse_args()

    # Load repo `.env` so this script can be run without manually exporting vars every time.
    load_repo_dotenv()

    base_url = _env_required("ENKIDU_BASE_URL").rstrip("/")
    admin_token = _env_required("ENKIDU_ADMIN_TOKEN")
    allow_secrets = os.environ.get("ENKIDU_ALLOW_SECRETS", "").strip() == "1"
    skip_embeddings = os.environ.get("ENKIDU_SKIP_EMBEDDINGS", "").strip() == "1"

    raw = args.bib_path.read_text(encoding="utf-8", errors="replace")
    entries = parse_bibtex(raw)
    if not entries:
        print("No BibTeX entries found.")
        return 0

    print(f"Using ENKIDU_BASE_URL={base_url}")
    common_headers = {"authorization": f"Bearer {admin_token}"}
    if allow_secrets:
        common_headers["x-enkidu-allow-secrets"] = "1"
    if skip_embeddings:
        common_headers["x-enkidu-skip-embeddings"] = "1"

    # Build a map of existing Zotero pages by citekey so reruns can update in-place.
    # IMPORTANT: Supabase/PostgREST often caps responses at 1000 rows, regardless of requested limit,
    # so we page using offset.
    # Note: GET /api/pages returns newest first, so we keep the first page for any duplicate citekey.
    existing_by_citekey: dict[str, dict[str, Any]] = {}
    duplicate_citekeys: set[str] = set()

    PAGE_SIZE = 1000
    MAX_EXISTING = 5000
    fetched = 0
    offset = 0
    seen_first_ids: set[str] = set()

    while fetched < MAX_EXISTING:
        try:
            data = _http_json(
                url=(
                    f"{base_url}/api/pages"
                    f"?limit={PAGE_SIZE}&offset={offset}"
                    f"&kv_key={urllib.parse.quote('source')}&kv_value={urllib.parse.quote('zotero')}"
                ),
                method="GET",
                headers=common_headers,
            )
        except RuntimeError as e:
            msg = str(e)
            if "API error 401" in msg or "401" in msg:
                # Try to surface the server's debug hint (it appends JSON after a newline).
                hint = ""
                if "\n" in msg:
                    hint = msg.split("\n", 1)[1].strip()
                client_len = len(f"Bearer {admin_token}".strip())
                print(
                    "ERROR: Unauthorized (401). The ENKIDU_ADMIN_TOKEN used by this script does not match the server.\n"
                    "- If ENKIDU_BASE_URL points at your deployed site, use the SAME admin token you configured in Netlify.\n"
                    "- If you pasted the token into Netlify with extra spaces/commas, the server only uses the first segment before whitespace/comma.\n"
                    "- Ensure your PowerShell env var (or repo .env) matches exactly.\n"
                    f"- Client Authorization header length: {client_len}\n"
                    f"- Server hint (if provided): {hint or '(none)'}",
                    file=sys.stderr,
                )
                return 2
            raise
        existing_pages = (data or {}).get("pages", []) or []
        if not existing_pages:
            break

        # Detect "offset ignored" (common when hitting an older deployed API).
        first_id = str(existing_pages[0].get("id") or "").strip()
        if first_id and first_id in seen_first_ids:
            print(
                "ERROR: backend appears to ignore the offset parameter (received the same first page of results again).\n"
                "You likely need to redeploy the updated Netlify Functions (or point ENKIDU_BASE_URL at your local netlify dev).\n"
                "Refusing to continue to avoid creating duplicates / partial purges.",
                file=sys.stderr,
            )
            return 2
        if first_id:
            seen_first_ids.add(first_id)

        for page in existing_pages:
            ck = (page.get("kv_tags") or {}).get("zotero_citekey")
            if isinstance(ck, str) and ck.strip():
                key = ck.strip()
                if key in existing_by_citekey:
                    duplicate_citekeys.add(key)
                    continue
                existing_by_citekey[key] = page

        fetched += len(existing_pages)
        offset += len(existing_pages)
        if len(existing_pages) < PAGE_SIZE:
            break

    if fetched >= MAX_EXISTING:
        print(
            f"WARNING: stopped after fetching {MAX_EXISTING} existing Zotero pages. If you have more, reruns may create duplicates.",
            file=sys.stderr,
        )

    if args.purge_existing and existing_by_citekey:
        # Purpose: allow a clean reimport (single bulk delete; much faster than 1000s of per-page deletes).
        print("Purging existing Zotero pages (bulk delete)...")
        try:
            res = _http_json(
                url=(
                    f"{base_url}/api/pages"
                    f"?confirm=1"
                    f"&kv_key={urllib.parse.quote('source')}&kv_value={urllib.parse.quote('zotero')}"
                ),
                method="DELETE",
                headers=common_headers,
            ) or {}
        except RuntimeError as e:
            msg = str(e)
            if "API error 405" in msg or "405" in msg:
                print(
                    "ERROR: your current backend does not support bulk delete yet (DELETE /api/pages returned 405 Method Not Allowed).\n"
                    "You need to redeploy the updated Netlify Functions (or point ENKIDU_BASE_URL at your local netlify dev) and retry.",
                    file=sys.stderr,
                )
                return 2
            raise
        if isinstance(res, dict) and res.get("ok") is True:
            print(f"Purged existing Zotero pages. Deleted {res.get('deleted')} (before={res.get('before')}, after={res.get('after')}).")
        else:
            print(f"Purged existing Zotero pages. (Unexpected response: {res!r})")
        existing_by_citekey = {}
        duplicate_citekeys = set()

    print(f"Found {len(existing_by_citekey)} existing Zotero pages (by zotero_citekey).")

    imported = 0
    updated = 0
    unchanged = 0
    skipped_duplicates = 0

    if duplicate_citekeys:
        # Warn loudly: duplicate citekeys mean prior imports created duplicates or citekeys changed.
        print(
            "WARNING: multiple existing pages share the same zotero_citekey (keeping newest page; older duplicates ignored):\n"
            + "\n".join(sorted(duplicate_citekeys)),
            file=sys.stderr,
        )

    to_upsert: list[dict[str, Any]] = []

    for entry in entries:
        new_import_id = _stable_import_id(entry)
        new_source_hash = _source_hash(entry)

        kv_tags: dict[str, Any] = {
            "source": "zotero",
            "zotero_citekey": entry.citekey,
            "zotero_type": entry.entry_type,
            "zotero_import_id": new_import_id,
            "zotero_source_hash": new_source_hash,
        }
        # Store all BibTeX fields as kv_tags (as requested: author/year/journaltitle/etc).
        for k, v in entry.fields.items():
            if v and k not in kv_tags:
                kv_tags[k] = v

        title = _page_title(entry.fields)
        content_md = _body_markdown(entry.fields)

        existing_page = existing_by_citekey.get(entry.citekey)
        if not existing_page:
            to_upsert.append(
                {
                    "title": title,
                    "content_md": content_md,
                    "tags": ["zotero"],
                    "kv_tags": kv_tags,
                }
            )
            continue

        # Update only if the Zotero source hash changed (or is missing).
        old_kv = existing_page.get("kv_tags") or {}
        old_hash = old_kv.get("zotero_source_hash")
        if isinstance(old_hash, str) and old_hash.strip() == new_source_hash:
            unchanged += 1
            continue

        # Merge kv_tags so we don't blow away unrelated keys the user may have added manually.
        merged_kv = dict(old_kv)
        merged_kv.update(kv_tags)

        page_id = str(existing_page.get("id") or "").strip()
        if not page_id:
            skipped_duplicates += 1
            continue

        to_upsert.append(
            {
                "id": page_id,
                "title": title,
                "content_md": content_md,
                "tags": ["zotero"],
                "kv_tags": merged_kv,
            }
        )

    # Bulk upsert in chunks (one HTTP call per chunk).
    # Requires backend support for POST /api/pages with {pages:[...]} and x-enkidu-skip-embeddings: 1.
    if to_upsert:
        chunks = _chunked(to_upsert, 250)
        for idx, chunk in enumerate(chunks, start=1):
            _http_json(
                url=f"{base_url}/api/pages",
                method="POST",
                headers=common_headers,
                body_obj={"pages": chunk},
            )
            # Best-effort progress: count inserts vs updates in the chunk.
            imported += sum(1 for p in chunk if not p.get("id"))
            updated += sum(1 for p in chunk if p.get("id"))
            print(f"Bulk upsert {idx}/{len(chunks)}: processed {len(chunk)} pages...")

    print(f"Done. Imported {imported} pages. Updated {updated} pages. Unchanged {unchanged} pages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


