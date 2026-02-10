from __future__ import annotations

import argparse
import os
import subprocess
import sys
import json
from pathlib import Path

from runtime.engine import run_skill


def _maybe_reexec_in_venv(project_root: Path) -> None:
    """
    Ensure we run under the shared venv (runtime/deps/python/venv) when it exists.

    This makes "public dependencies" truly shared across all skills without users having
    to remember which python to invoke.
    """
    if os.environ.get("SKILLBOX_NO_REEXEC") == "1":
        return
    venv_py = project_root / "runtime" / "deps" / "python" / "venv" / "Scripts" / "python.exe"
    if not venv_py.exists():
        return
    if Path(sys.executable).resolve() == venv_py.resolve():
        return
    env = os.environ.copy()
    env["SKILLBOX_NO_REEXEC"] = "1"
    subprocess.check_call([str(venv_py), str(Path(__file__).resolve()), *sys.argv[1:]], env=env)
    raise SystemExit(0)


def main(argv: list[str] | None = None) -> int:
    project_root = Path(__file__).resolve().parent
    _maybe_reexec_in_venv(project_root)

    parser = argparse.ArgumentParser(description="Run a skill by name (or list/validate skills).")
    parser.add_argument("--skill", required=False, help="Skill name, e.g. web_automation_skill")
    parser.add_argument("--list", action="store_true", help="List available skills (from skill.json manifests)")
    parser.add_argument("--validate", action="store_true", help="Validate a skill's manifest and entrypoint")
    parser.add_argument("--run-id", default=None, help="Optional run id. Use to let multiple agents share a run.")
    parser.add_argument("--agent", default=None, help="Agent id (e.g. agent0/agent1). Defaults to env or agent0.")
    parser.add_argument(
        "--set",
        action="append",
        default=[],
        help="Override skill config without editing files. Repeatable: --set key=value",
    )
    parser.add_argument(
        "--root",
        default=None,
        help="Project root (defaults to auto-detect). Useful when running from a different CWD.",
    )
    args = parser.parse_args(argv)

    root_dir = Path(args.root).resolve() if args.root else project_root

    if args.list:
        from runtime.registry import discover_skills

        skills = discover_skills(root_dir)
        if not skills:
            print("(no skills found)")
            return 0
        w1 = max(len(s.name) for s in skills)
        w2 = max(len(s.version) for s in skills)
        print(f"{'skill'.ljust(w1)}  {'version'.ljust(w2)}  description")
        for s in skills:
            print(f"{s.name.ljust(w1)}  {s.version.ljust(w2)}  {s.description}")
        return 0

    if args.validate:
        if not args.skill:
            raise SystemExit("--validate requires --skill <name>")
        from runtime.registry import validate_skill

        validate_skill(args.skill, root_dir)
        print("OK")
        return 0

    if not args.skill:
        raise SystemExit("Missing --skill (or use --list/--validate)")

    overrides: dict[str, object] = {}
    for item in args.set:
        if "=" not in item:
            raise SystemExit(f"Invalid --set value (expected key=value): {item}")
        k, v = item.split("=", 1)
        k = k.strip()
        v = v.strip()
        if not k:
            raise SystemExit(f"Invalid --set key: {item}")
        # Try to parse JSON scalars/arrays/objects; fall back to raw string.
        try:
            overrides[k] = json.loads(v)
        except Exception:
            overrides[k] = v

    res = run_skill(
        args.skill,
        root_dir=root_dir,
        run_id=args.run_id,
        agent_id=args.agent,
        config_overrides=overrides or None,
        invocation={"argv": sys.argv[1:], "set": args.set},
    )
    # Keep CLI output predictable for piping.
    # Use ASCII escapes to avoid Windows console encoding issues (e.g., GBK).
    print(json.dumps(res, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
