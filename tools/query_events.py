from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable


def _iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except Exception:
            continue


def main() -> int:
    p = argparse.ArgumentParser(description="Query events.jsonl across outputs/")
    p.add_argument("--root", default=".", help="Project root (default: .)")
    p.add_argument("--skill", default=None, help="Filter by skill name")
    p.add_argument("--run-id", default=None, help="Filter by run id")
    p.add_argument("--agent", default=None, help="Filter by agent id")
    p.add_argument("--event", default=None, help="Filter by event name (exact match)")
    p.add_argument("--contains", default=None, help="Substring filter over JSON text")
    p.add_argument("--limit", type=int, default=50, help="Max events to print (default: 50)")
    args = p.parse_args()

    root = Path(args.root).resolve()
    outputs = root / "outputs"
    if not outputs.exists():
        print(f"outputs not found: {outputs}")
        return 2

    # Search agent-private events first (safer without locks).
    events_files: list[Path] = []
    for skill_dir in sorted([p for p in outputs.iterdir() if p.is_dir()]):
        if args.skill and skill_dir.name != args.skill:
            continue
        for run_dir in sorted([p for p in skill_dir.iterdir() if p.is_dir()]):
            if args.run_id and run_dir.name != args.run_id:
                continue
            agents_dir = run_dir / "agents"
            if not agents_dir.exists():
                continue
            for agent_dir in sorted([p for p in agents_dir.iterdir() if p.is_dir()]):
                if args.agent and agent_dir.name != args.agent:
                    continue
                f = agent_dir / "events.jsonl"
                if f.exists():
                    events_files.append(f)

    count = 0
    for f in events_files:
        for rec in _iter_jsonl(f):
            if args.event and rec.get("event") != args.event:
                continue
            if args.contains:
                if args.contains not in json.dumps(rec, ensure_ascii=False):
                    continue
            print(json.dumps(rec, ensure_ascii=False))
            count += 1
            if count >= args.limit:
                return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

