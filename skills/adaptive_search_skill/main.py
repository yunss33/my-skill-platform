from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from skills.rpa_ts_skill.common.runner import run_rpaskill_ts


def _collect_screenshots_from_trace(trace_path: Path) -> list[str]:
    shots: list[str] = []
    seen = set()
    if not trace_path.exists():
        return shots
    for line in trace_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except Exception:
            continue
        sp = rec.get("screenshotPath")
        if not sp:
            continue
        sp = str(sp)
        if sp in seen:
            continue
        seen.add(sp)
        shots.append(sp)
    return shots


def run(ctx) -> dict[str, Any]:
    """
    Migrated from RPASkill/src/skills/adaptiveSearch.ts as a first-class platform skill.
    This is a thin wrapper that delegates to the TS implementation.
    """
    cfg = ctx.config or {}
    if not cfg.get("query"):
        raise ValueError("config.yaml must include `query`")

    cfg = dict(cfg)
    cfg.setdefault("screenshotPrefix", str((ctx.outputs_dir / "screenshots" / "search").resolve()))
    cfg.setdefault("openScreenshotPrefix", str((ctx.outputs_dir / "screenshots" / "open").resolve()))
    cfg.setdefault("openScreenshotFullPage", True)
    cfg.setdefault("tracePath", str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()))

    out = run_rpaskill_ts(ctx, action="adaptiveSearch", payload=dict(cfg))
    screenshots = _collect_screenshots_from_trace(Path(cfg["tracePath"]))
    return {"status": "ok", "rpaskill_ts": out, "screenshots": screenshots, "tracePath": cfg["tracePath"]}
