from __future__ import annotations

import importlib
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any, Optional


def utc_now_compact() -> str:
    # Example: 20260210T153045Z
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any, *, indent: int = 2) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=indent) + "\n", encoding="utf-8")


def try_load_yaml(path: Path) -> dict[str, Any]:
    """
    Load YAML if PyYAML is installed; otherwise return an empty dict.
    Keep runtime importable even before dependencies are installed.
    """
    if not path.exists():
        return {}
    try:
        import yaml  # type: ignore
    except Exception:
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data or {}


def import_module(module_name: str) -> ModuleType:
    return importlib.import_module(module_name)


def add_sys_path(path: Path) -> None:
    p = str(path.resolve())
    if p not in sys.path:
        sys.path.insert(0, p)


def get_project_root(start: Optional[Path] = None) -> Path:
    """
    Resolve the project root (folder that contains this file's parent).
    Used to make running from different CWDs predictable.
    """
    if start is None:
        start = Path(__file__).resolve()
    # runtime/utils.py -> runtime -> project root
    return start.parent.parent
