from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from skills.rpa_ts_skill.common.runner import run_rpaskill_ts


def run(ctx) -> dict[str, Any]:
    cfg = ctx.config or {}
    keyword = str(cfg.get("keyword") or "空调").strip()
    limit = int(cfg.get("limit") or 12)

    # PDD H5 search (often triggers captcha; requires human-in-loop).
    search_url = f"https://mobile.yangkeduo.com/search_result.html?search_key={quote(keyword)}"

    # Prefer a persistent Playwright userDataDir profile for PDD (more "browser-like").
    account_raw = str(cfg.get("profileAccount") or cfg.get("account") or cfg.get("profile") or "default").strip()
    account = re.sub(r"[^A-Za-z0-9._-]+", "_", account_raw) or "default"
    profile_dir = (ctx.platform.deps_dir / "browser_profiles" / "pdd" / account).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)

    # Persist a storageState snapshot too (useful for backup/export; userDataDir is the main reuse mechanism).
    storage_state_path = (ctx.platform.deps_dir / "storage_states" / "pdd" / f"{account}.json").resolve()
    storage_state_path.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {
        # Action wiring (Node)
        "searchUrl": search_url,
        # Wait until any visible price-like token shows up (Playwright selector, not CSS).
        "resultsWaitFor": str(cfg.get("resultsWaitFor") or r"text=/[￥¥]\s*\d/"),
        "waitForLoadState": str(cfg.get("waitForLoadState") or "domcontentloaded"),
        "resultsTimeout": int(cfg.get("resultsTimeout") or 120000),
        "afterSearchDelayMs": int(cfg.get("afterSearchDelayMs") or 2500),
        "limit": limit,
        "scrollSteps": int(cfg.get("scrollSteps") or 4),
        "scrollDelayMs": int(cfg.get("scrollDelayMs") or 900),
        "screenshotPath": str((ctx.outputs_dir / "screenshots" / "pdd_search.png").resolve()),
        # Optional: capture page artifacts (screenshot + html + elements) for AI debugging / replay.
        "capturePrefix": str((ctx.outputs_dir / "captures" / "pdd_search").resolve()),
        "captureFullPage": bool(cfg.get("captureFullPage", True)),
        "includeHtml": bool(cfg.get("includeHtml", True)),
        "includeElements": bool(cfg.get("includeElements", True)),
        "maxElements": int(cfg.get("maxElements") or 350),
        "captureOnBlocked": bool(cfg.get("captureOnBlocked", True)),
        "captureOnDone": bool(cfg.get("captureOnDone", True)),
        "detectBlockers": bool(cfg.get("detectBlockers", True)),
        # Pace controls (best-effort)
        "stepDelayMs": int(cfg.get("stepDelayMs") or 700),
        "stepDelayJitterMs": int(cfg.get("stepDelayJitterMs") or 500),
        # Human-in-the-loop
        "pauseForHuman": bool(cfg.get("pauseForHuman", True)),
        # Prefer auto polling by default: user solves captcha in the visible browser; skill continues when ready.
        "pauseForHumanMode": str(cfg.get("pauseForHumanMode") or "auto"),
        "pauseTimeoutMs": int(cfg.get("pauseTimeoutMs") or 0),
        "pauseMessage": cfg.get("pauseMessage")
        or "拼多多可能会出现验证码/安全验证。请在弹出的浏览器里完成验证/登录后，保持页面不关闭；脚本会在检测到价格内容出现后继续抓取。",
        # Trace
        "tracePath": str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()),
        "traceAppend": False,
        # Browser
        "headless": bool(cfg.get("headless", False)),
        "channel": cfg.get("channel") or "msedge",
        "slowMo": int(cfg.get("slowMo") or 0),
        "args": cfg.get("args") or [],
        "viewport": cfg.get("viewport", None),
        "userDataDir": str(profile_dir),
        "storageStatePath": str(storage_state_path) if storage_state_path.exists() else None,
        "saveStorageStatePath": str(storage_state_path),
    }

    if payload.get("storageStatePath") is None:
        payload.pop("storageStatePath", None)

    out = run_rpaskill_ts(ctx, action="searchProductsHeuristic", payload=payload)

    # Write a stable pointer so the agent can locate artifacts without the user pasting paths/screenshots.
    try:
        skill_root = ctx.platform.root_dir / "outputs" / "pdd_aircon_price_skill"
        skill_root.mkdir(parents=True, exist_ok=True)
        marker_path = skill_root / "_latest.json"
        marker = {
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "skill": "pdd_aircon_price_skill",
            "run_id": str(ctx.run_id),
            "agent_id": str(ctx.agent_id),
            "action": "searchProductsHeuristic",
            "paths": {
                "outputs_dir": str(Path(ctx.outputs_dir).resolve()),
                "shared_dir": str(Path(ctx.shared_dir).resolve()),
                "captures_dir": str((ctx.outputs_dir / "captures").resolve()),
                "screenshots_dir": str((ctx.outputs_dir / "screenshots").resolve()),
                "trace_path": str(payload.get("tracePath") or ""),
                "capture_prefix": str(payload.get("capturePrefix") or ""),
            },
            "payload_hints": {
                "searchUrl": payload.get("searchUrl"),
                "resultsWaitFor": payload.get("resultsWaitFor"),
                "pauseForHuman": payload.get("pauseForHuman"),
                "pauseForHumanMode": payload.get("pauseForHumanMode"),
                "scrollSteps": payload.get("scrollSteps"),
                "stepDelayMs": payload.get("stepDelayMs"),
                "stepDelayJitterMs": payload.get("stepDelayJitterMs"),
            },
        }
        marker_path.write_text(json.dumps(marker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass

    # Persist a friendly, stable artifact for later AI querying.
    ctx.artifacts.write_json("pdd_aircon_prices.json", out, scope="agent")
    return {"status": "ok", "keyword": keyword, "searchUrl": search_url, "result": out}
