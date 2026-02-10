from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from ..utils import ensure_dir


def _utc_ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class MemoryMeta:
    skill: str
    run_id: str
    agent_id: str


class MemoryLog:
    """
    Append-only JSONL memory.

    Intended to store small, query-friendly facts/decisions, not large blobs.
    """

    def __init__(self, path: Path, *, meta: MemoryMeta) -> None:
        self.path = path
        self.meta = meta
        ensure_dir(self.path.parent)

    def append(self, item: dict[str, Any]) -> dict[str, Any]:
        rec = {
            "ts": _utc_ts(),
            "skill": self.meta.skill,
            "run_id": self.meta.run_id,
            "agent_id": self.meta.agent_id,
            "item": item,
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec


class MemoryStore:
    def __init__(self, *, agent_log: MemoryLog, shared_log: Optional[MemoryLog] = None) -> None:
        self._agent = agent_log
        self._shared = shared_log

    def append(self, item: dict[str, Any], *, scope: Literal["agent", "shared", "both"] = "agent") -> dict[str, Any]:
        if scope == "agent":
            return self._agent.append(item)
        if scope == "shared":
            if not self._shared:
                raise RuntimeError("shared memory is not configured for this run")
            return self._shared.append(item)
        rec = self._agent.append(item)
        if self._shared:
            self._shared.append(item)
        return rec

