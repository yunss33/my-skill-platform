from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Convenience wrapper for adaptive_search_skill (no file edits).")
    p.add_argument("--query", required=False, help="Search query text")
    p.add_argument("--goal", default="auto")
    p.add_argument("--language", default="auto")
    p.add_argument("--engine", default="bing")
    p.add_argument("--pages", type=int, default=2)
    p.add_argument("--per-page", type=int, default=10)
    p.add_argument("--details", type=int, default=0)
    p.add_argument("--min-results", type=int, default=5)
    p.add_argument("--max-rounds", type=int, default=2)
    p.add_argument("--log-enabled", default="true", choices=["true", "false"])
    p.add_argument("--log-format", default="jsonl", choices=["json", "jsonl"])
    p.add_argument("--headless", default="true", choices=["true", "false"])
    p.add_argument("--channel", default="msedge")
    p.add_argument("--executable-path", default=None, help="Optional full browser executable path")
    p.add_argument("--run-id", default="adaptive_cli")
    p.add_argument("--agent", default="agent0")
    p.add_argument("--root", default=".", help="Project root (default: .)")
    args = p.parse_args(argv)

    query = args.query or input("query: ").strip()
    if not query:
        raise SystemExit("Missing --query (or empty input)")

    root = Path(args.root).resolve()
    run_py = root / "run.py"
    if not run_py.exists():
        raise SystemExit(f"run.py not found under root: {root}")

    cmd = [
        sys.executable,
        str(run_py),
        "--skill",
        "adaptive_search_skill",
        "--root",
        str(root),
        "--run-id",
        args.run_id,
        "--agent",
        args.agent,
        "--set",
        f'query={query}',
        "--set",
        f"goal={args.goal}",
        "--set",
        f"language={args.language}",
        "--set",
        f"engine={args.engine}",
        "--set",
        f"pages={args.pages}",
        "--set",
        f"perPage={args.per_page}",
        "--set",
        f"details={args.details}",
        "--set",
        f"minResults={args.min_results}",
        "--set",
        f"maxRounds={args.max_rounds}",
        "--set",
        f"logEnabled={args.log_enabled}",
        "--set",
        f"logFormat={args.log_format}",
        "--set",
        f"headless={args.headless}",
        "--set",
        f"channel={args.channel}",
    ]
    if args.executable_path:
        cmd += ["--set", f"executablePath={args.executable_path}"]

    subprocess.check_call(cmd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

