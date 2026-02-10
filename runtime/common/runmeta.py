from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..utils import ensure_dir


def _utc_ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class RunMeta:
    skill: str
    run_id: str
    root_dir: str
    agent_id: str
    started_at: str
    coordinator: bool


def write_if_missing(path: Path, obj: dict[str, Any]) -> None:
    """
    Best-effort "create once" without locks.
    Good enough when a single coordinator writes shared metadata.
    """
    ensure_dir(path.parent)
    if path.exists():
        return
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_agent_meta(agent_dir: Path, meta: RunMeta, *, config: dict[str, Any]) -> Path:
    p = agent_dir / "agent.json"
    payload = {
        "skill": meta.skill,
        "run_id": meta.run_id,
        "agent_id": meta.agent_id,
        "started_at": meta.started_at,
        "coordinator": meta.coordinator,
        "config": config,
    }
    ensure_dir(agent_dir)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def write_shared_run_meta(shared_dir: Path, meta: RunMeta) -> Path:
    p = shared_dir / "run.json"
    payload = {
        "skill": meta.skill,
        "run_id": meta.run_id,
        "root_dir": meta.root_dir,
        "started_at": meta.started_at,
    }
    write_if_missing(p, payload)
    return p

