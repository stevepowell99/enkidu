"""
Minimal .env loader for the standalone Python scripts in this repo.

Why: Python does not auto-read `.env`. These scripts expect variables like
ENKIDU_BASE_URL / ENKIDU_ADMIN_TOKEN to exist in `os.environ`.
"""

from __future__ import annotations

import os
from pathlib import Path


def load_dotenv_file(path: Path, *, override: bool = False) -> None:
    # Load KEY=VALUE lines into the current process env (does not touch the system/user env).
    if not path.exists() or not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        # Support `export KEY=VALUE` (common in shell-style env files).
        if line.lower().startswith("export "):
            line = line[7:].lstrip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        # Strip simple quotes: KEY="value" or KEY='value'
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        if not override and os.environ.get(key):
            continue

        os.environ[key] = value


def load_repo_dotenv(*, override: bool = False) -> None:
    # Repo layout: <repo>/scripts/_dotenv.py -> parents[1] is repo root.
    repo_root = Path(__file__).resolve().parents[1]
    load_dotenv_file(repo_root / ".env", override=override)


