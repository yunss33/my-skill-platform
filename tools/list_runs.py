from __future__ import annotations

import argparse
import json
from pathlib import Path


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    p = argparse.ArgumentParser(description="List runs under outputs/")
    p.add_argument("--root", default=".", help="Project root (default: .)")
    p.add_argument("--skill", default=None, help="Filter by skill name")
    args = p.parse_args()

    root = Path(args.root).resolve()
    outputs = root / "outputs"
    if not outputs.exists():
        print(f"outputs not found: {outputs}")
        return 2

    skills = [outputs / args.skill] if args.skill else [p for p in outputs.iterdir() if p.is_dir()]

    rows: list[tuple[str, str, str, str]] = []
    for skill_dir in sorted(skills):
        if not skill_dir.exists():
            continue
        skill = skill_dir.name
        for run_dir in sorted([p for p in skill_dir.iterdir() if p.is_dir()]):
            run_id = run_dir.name
            agents_dir = run_dir / "agents"
            if not agents_dir.exists():
                continue
            for agent_dir in sorted([p for p in agents_dir.iterdir() if p.is_dir()]):
                agent = agent_dir.name
                result = agent_dir / "result.json"
                status = "-"
                if result.exists():
                    try:
                        status = str(_read_json(result).get("status", "-"))
                    except Exception:
                        status = "bad-json"
                rows.append((skill, run_id, agent, status))

    if not rows:
        print("(no runs found)")
        return 0

    # Simple fixed-width table
    w1 = max(len(r[0]) for r in rows)
    w2 = max(len(r[1]) for r in rows)
    w3 = max(len(r[2]) for r in rows)
    print(f"{'skill'.ljust(w1)}  {'run_id'.ljust(w2)}  {'agent'.ljust(w3)}  status")
    for s, r, a, st in rows:
        print(f"{s.ljust(w1)}  {r.ljust(w2)}  {a.ljust(w3)}  {st}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

