#!/usr/bin/env python3
"""
Clean a Raindrop HTML export by removing "extra" consecutive link rows.

Rule implemented (minimal + targeted):
- When a note block starts (a line beginning with <DD ...>), keep ONLY the last
  pending link line (<DT><A ...>) immediately before that note block.
- Links that are not followed by a note block are left unchanged.

Usage (PowerShell):
  python scripts/clean_raindrop_export_links.py "C:/Users/Zoom/Downloads/c4a6e179-d08c-48c3-b36a-3e23f4a78792.html"
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


LINK_RE = re.compile(r"^\s*<DT><A\b", re.IGNORECASE)  # Raindrop link row
NOTE_RE = re.compile(r"^\s*<DD\b", re.IGNORECASE)    # note/description row(s)


def clean_lines(lines: list[str]) -> list[str]:
    # Keep a run of link lines until we know what comes next.
    pending_links: list[str] = []
    pending_blanks: list[str] = []  # blank lines after pending_links (preserve order)
    out: list[str] = []

    for line in lines:
        stripped = line.strip()

        is_link = bool(LINK_RE.match(line))
        is_note = bool(NOTE_RE.match(line))
        is_blank = stripped == ""

        if is_link:
            # If we somehow accumulated blanks without any links, flush them.
            if not pending_links and pending_blanks:
                out.extend(pending_blanks)
                pending_blanks = []
            pending_links.append(line)
            continue

        if is_blank and pending_links:
            # Don't break the "links before note" grouping on blank lines.
            pending_blanks.append(line)
            continue

        if is_note:
            # Note starts: keep only the last link from any run right before it.
            if pending_links:
                out.append(pending_links[-1])
                pending_links = []
                out.extend(pending_blanks)
                pending_blanks = []
            out.append(line)
            continue

        # Any other line: these pending links weren't followed by a note, so keep them all.
        if pending_links:
            out.extend(pending_links)
            pending_links = []
        if pending_blanks:
            out.extend(pending_blanks)
            pending_blanks = []
        out.append(line)

    # Flush anything left at EOF.
    if pending_links:
        out.extend(pending_links)
    if pending_blanks:
        out.extend(pending_blanks)

    return out


def main() -> int:
    p = argparse.ArgumentParser(
        description="Clean Raindrop HTML export by dropping extra consecutive <DT><A> lines right before notes."
    )
    p.add_argument("input_html", type=Path, help="Path to the Raindrop HTML export")
    p.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output path. Default: <input>_cleaned.html next to the input.",
    )
    args = p.parse_args()

    src: Path = args.input_html
    if args.output is None:
        out_path = src.with_name(f"{src.stem}_cleaned{src.suffix}")
    else:
        out_path = args.output

    text = src.read_text(encoding="utf-8", errors="strict")
    lines = text.splitlines(keepends=True)
    cleaned = clean_lines(lines)
    out_path.write_text("".join(cleaned), encoding="utf-8", errors="strict")

    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


