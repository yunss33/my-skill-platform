from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from ..utils import ensure_dir


def _utc_ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class EventMeta:
    skill: str
    run_id: str
    agent_id: str


class EventLog:
    """
    Append-only JSONL event log.

    Without locks, the safe pattern for multi-agent is: one file per agent.
    """

    def __init__(self, path: Path, *, meta: EventMeta) -> None:
        self.path = path
        self.meta = meta
        ensure_dir(self.path.parent)

    def emit(
        self,
        event: str,
        *,
        message: str = "",
        level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO",
        data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        rec: dict[str, Any] = {
            "ts": _utc_ts(),
            "id": uuid.uuid4().hex[:12],
            "level": level,
            "event": event,
            "message": message,
            "skill": self.meta.skill,
            "run_id": self.meta.run_id,
            "agent_id": self.meta.agent_id,
            "pid": os.getpid(),
        }
        if data:
            rec["data"] = data
        # Note: no lock. Prefer one file per agent to avoid interleaving lines.
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec


class EventBus:
    """
    Convenience wrapper: log agent-private events and (optionally) shared events.

    Default goes to agent log only; shared log is best reserved for a single coordinator agent
    until locking is implemented.
    """

    def __init__(self, *, agent_log: EventLog, shared_log: Optional[EventLog] = None) -> None:
        self._agent = agent_log
        self._shared = shared_log

    def emit(
        self,
        event: str,
        *,
        message: str = "",
        level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO",
        data: Optional[dict[str, Any]] = None,
        scope: Literal["agent", "shared", "both"] = "agent",
    ) -> dict[str, Any]:
        if scope == "agent":
            return self._agent.emit(event, message=message, level=level, data=data)
        if scope == "shared":
            if not self._shared:
                raise RuntimeError("shared event log is not configured for this run")
            return self._shared.emit(event, message=message, level=level, data=data)
        # both
        rec = self._agent.emit(event, message=message, level=level, data=data)
        if self._shared:
            self._shared.emit(event, message=message, level=level, data=data)
        return rec

