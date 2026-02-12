from __future__ import annotations

import json
import re
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
    # Reuse login/session across runs:
    # - Use a fixed persistent Playwright userDataDir under runtime/deps/
    # - Also save a storageState snapshot per run (useful for debugging / optional reuse)
    profile_site_raw = str(cfg.get("profileSite") or cfg.get("site") or "adaptive_search").strip()
    profile_account_raw = str(cfg.get("profileAccount") or cfg.get("account") or cfg.get("profile") or "default").strip()

    # Keep directory names filesystem-friendly and stable across shells/quoting.
    profile_site = re.sub(r"[^A-Za-z0-9._-]+", "_", profile_site_raw) or "adaptive_search"
    profile_account = re.sub(r"[^A-Za-z0-9._-]+", "_", profile_account_raw) or "default"

    # Convention: browser_profiles/<site>/<account>/
    profile_dir = (ctx.platform.deps_dir / "browser_profiles" / profile_site / profile_account).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)
    cfg.setdefault("userDataDir", str(profile_dir))

    storage_state_path = (ctx.platform.deps_dir / "storage_states" / profile_site / f"{profile_account}.json").resolve()
    storage_state_path.parent.mkdir(parents=True, exist_ok=True)
    # Load if present (no-op when userDataDir is used, but harmless).
    if storage_state_path.exists():
        cfg.setdefault("storageStatePath", str(storage_state_path))
    # Always attempt to save an updated snapshot after the run.
    cfg.setdefault("saveStorageStatePath", str(storage_state_path))

    cfg.setdefault("screenshotPrefix", str((ctx.outputs_dir / "screenshots" / "search").resolve()))
    cfg.setdefault("openScreenshotPrefix", str((ctx.outputs_dir / "screenshots" / "open").resolve()))
    cfg.setdefault("openScreenshotFullPage", True)
    cfg.setdefault("tracePath", str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()))

    out = run_rpaskill_ts(ctx, action="adaptiveSearch", payload=dict(cfg))
    screenshots = _collect_screenshots_from_trace(Path(cfg["tracePath"]))
    return {"status": "ok", "rpaskill_ts": out, "screenshots": screenshots, "tracePath": cfg["tracePath"]}
