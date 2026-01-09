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
    data = None
    if body_obj is not None:
        data = json.dumps(body_obj).encode("utf-8")
        headers = {**headers, "content-type": "application/json"}

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace").strip()
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

    f = _collapse_ws(fields.get("file", ""))
    if f:
        file_url = _file_url_from_windows_path(f)
        if file_url:
            lines.append(f"[Open file]({file_url})")
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


def main() -> int:
    p = argparse.ArgumentParser(description="Import Zotero BibTeX .bib into Enkidu pages via /api/pages.")
    p.add_argument("bib_path", type=Path, help="Path to Zotero .bib file")
    args = p.parse_args()

    base_url = _env_required("ENKIDU_BASE_URL").rstrip("/")
    admin_token = _env_required("ENKIDU_ADMIN_TOKEN")
    allow_secrets = os.environ.get("ENKIDU_ALLOW_SECRETS", "").strip() == "1"

    raw = args.bib_path.read_text(encoding="utf-8", errors="replace")
    entries = parse_bibtex(raw)
    if not entries:
        print("No BibTeX entries found.")
        return 0

    common_headers = {"authorization": f"Bearer {admin_token}"}
    if allow_secrets:
        common_headers["x-enkidu-allow-secrets"] = "1"

    # Build a set of existing citekeys to avoid duplicates.
    existing: set[str] = set()
    data = _http_json(
        url=(
            f"{base_url}/api/pages"
            f"?limit=2000&kv_key={urllib.parse.quote('source')}&kv_value={urllib.parse.quote('zotero')}"
        ),
        method="GET",
        headers=common_headers,
    )
    for page in (data or {}).get("pages", []) or []:
        ck = (page.get("kv_tags") or {}).get("zotero_citekey")
        if isinstance(ck, str) and ck.strip():
            existing.add(ck.strip())

    imported = 0
    skipped = 0

    for entry in entries:
        if entry.citekey in existing:
            skipped += 1
            continue

        kv_tags: dict[str, Any] = {
            "source": "zotero",
            "zotero_citekey": entry.citekey,
            "zotero_type": entry.entry_type,
            "zotero_import_id": _stable_import_id(entry),
        }
        # Store all BibTeX fields as kv_tags (as requested: author/year/journaltitle/etc).
        for k, v in entry.fields.items():
            if v and k not in kv_tags:
                kv_tags[k] = v

        title = _page_title(entry.fields)
        content_md = _body_markdown(entry.fields)

        _http_json(
            url=f"{base_url}/api/pages",
            method="POST",
            headers=common_headers,
            body_obj={
                "title": title,
                "content_md": content_md,
                "tags": ["zotero"],
                "kv_tags": kv_tags,
                "thread_id": None,
                "next_page_id": None,
            },
        )

        imported += 1
        existing.add(entry.citekey)
        if imported % 25 == 0:
            print(f"Imported {imported} pages...")

    print(f"Done. Imported {imported} pages. Skipped {skipped} duplicates.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


