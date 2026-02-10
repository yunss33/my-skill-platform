from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Optional

from ..utils import ensure_dir


def _sha256_bytes(b: bytes) -> str:
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()


@dataclass(frozen=True)
class ArtifactMeta:
    skill: str
    run_id: str
    agent_id: str


class ArtifactStore:
    """
    Small helper for writing artifacts into agent/private or run/shared directories.

    Locking is intentionally out-of-scope for now:
    - Prefer writing to agent scope
    - Use shared scope only from a single coordinator agent
    """

    def __init__(
        self,
        *,
        agent_dir: Path,
        shared_dir: Path,
        meta: ArtifactMeta,
    ) -> None:
        self.agent_dir = agent_dir
        self.shared_dir = shared_dir
        self.meta = meta
        ensure_dir(self.agent_dir)
        ensure_dir(self.shared_dir)
        # Append-only index per agent (safe without locks).
        self._index_path = self.agent_dir / "index.jsonl"

    def path(self, rel: str, *, scope: Literal["agent", "shared"] = "agent") -> Path:
        base = self.agent_dir if scope == "agent" else self.shared_dir
        return base / rel

    def write_text(
        self,
        rel: str,
        text: str,
        *,
        scope: Literal["agent", "shared"] = "agent",
        encoding: str = "utf-8",
    ) -> Path:
        b = text.encode(encoding)
        return self.write_bytes(rel, b, scope=scope)

    def write_json(
        self,
        rel: str,
        data: Any,
        *,
        scope: Literal["agent", "shared"] = "agent",
        indent: int = 2,
    ) -> Path:
        b = (json.dumps(data, ensure_ascii=False, indent=indent) + "\n").encode("utf-8")
        return self.write_bytes(rel, b, scope=scope)

    def write_bytes(
        self,
        rel: str,
        data: bytes,
        *,
        scope: Literal["agent", "shared"] = "agent",
    ) -> Path:
        p = self.path(rel, scope=scope)
        ensure_dir(p.parent)
        p.write_bytes(data)
        self._record(p, size=len(data), sha256=_sha256_bytes(data), scope=scope, kind=None, data=None)
        return p

    def record_path(
        self,
        path: Path,
        *,
        scope: Literal["agent", "shared"] = "agent",
        kind: Optional[str] = None,
        data: Any = None,
    ) -> Optional[dict[str, Any]]:
        """
        Record a file that was created outside ArtifactStore (e.g., Node/Playwright screenshots).

        This does not move/copy the file; it only appends an index record so AI/tools can find it.
        """
        try:
            p = Path(path)
            if not p.exists() or not p.is_file():
                return None

            size = p.stat().st_size
            sha256 = self._sha256_file(p)
            rec = self._record(p, size=size, sha256=sha256, scope=scope, kind=kind, data=data)
            return rec
        except Exception:
            # Indexing should never break the skill run.
            return None

    def _sha256_file(self, path: Path, *, chunk_size: int = 1024 * 1024) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()

    def _record(
        self,
        path: Path,
        *,
        size: int,
        sha256: str,
        scope: str,
        kind: Optional[str],
        data: Any,
    ) -> dict[str, Any]:
        rec = {
            "skill": self.meta.skill,
            "run_id": self.meta.run_id,
            "agent_id": self.meta.agent_id,
            "scope": scope,
            "path": str(path),
            "size": size,
            "sha256": sha256,
        }
        if kind:
            rec["kind"] = kind
        if data is not None:
            rec["data"] = data
        with self._index_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec
