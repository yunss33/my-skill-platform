from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

from skills.rpa_ts_skill.common.runner import run_rpaskill_ts


def run(ctx) -> dict[str, Any]:
    cfg = ctx.config or {}
    keyword = str(cfg.get("keyword") or "空调").strip()
    limit = int(cfg.get("limit") or 12)

    search_url = f"https://search.jd.com/Search?keyword={quote(keyword)}&enc=utf-8"

    # Persist login across runs via Playwright storageState.
    # NOTE: this is NOT your system Edge profile; it is a Playwright storageState JSON.
    storage_state_path = (ctx.shared_dir / "jd_storage_state.json").resolve()
    # Prefer a persistent user profile directory for JD (more "browser-like").
    profile_dir = (ctx.platform.deps_dir / "browser_profiles" / "jd").resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {
        # action wiring (Node)
        "searchUrl": search_url,
        "resultsWaitFor": "#J_goodsList .gl-item",
        "waitForLoadState": "domcontentloaded",
        "resultsTimeout": int(cfg.get("resultsTimeout") or 60000),
        "afterSearchDelayMs": int(cfg.get("afterSearchDelayMs") or 2500),
        "limit": limit,
        "screenshotPath": str((ctx.outputs_dir / "screenshots" / "jd_search.png").resolve()),
        # Optional: capture page artifacts (screenshot + html + elements) for AI debugging / replay.
        "capturePrefix": str((ctx.outputs_dir / "captures" / "jd_search").resolve()),
        "captureFullPage": bool(cfg.get("captureFullPage", True)),
        "includeHtml": bool(cfg.get("includeHtml", True)),
        "includeElements": bool(cfg.get("includeElements", True)),
        "maxElements": int(cfg.get("maxElements") or 250),
        "captureOnBlocked": bool(cfg.get("captureOnBlocked", True)),
        "captureOnDone": bool(cfg.get("captureOnDone", True)),
        "detectBlockers": bool(cfg.get("detectBlockers", True)),
        # Pace controls (best-effort)
        "stepDelayMs": int(cfg.get("stepDelayMs") or 600),
        "stepDelayJitterMs": int(cfg.get("stepDelayJitterMs") or 400),
        "list": {
            "itemSelector": "#J_goodsList .gl-item",
            "fields": {
                "title": {"selector": ".p-name em", "attr": "text"},
                "price": {"selector": ".p-price i", "attr": "text"},
                "link": {"selector": ".p-name a", "attr": "href"},
            },
        },
        # Browser
        "headless": bool(cfg.get("headless", False)),
        "channel": cfg.get("channel") or "msedge",
        "slowMo": int(cfg.get("slowMo") or 0),
        "args": cfg.get("args") or [],
        "viewport": cfg.get("viewport", None),
        "userDataDir": str(profile_dir),
        # Load existing session if present, and always save updated state after a successful run.
        "storageStatePath": str(storage_state_path) if storage_state_path.exists() else None,
        "saveStorageStatePath": str(storage_state_path),
        # Human-in-the-loop
        "pauseForHuman": bool(cfg.get("pauseForHuman", True)),
        # In heavily-protected flows (JD risk pages), "enter" mode is more reliable than blind polling.
        "pauseForHumanMode": str(cfg.get("pauseForHumanMode") or "enter"),
        "pauseTimeoutMs": int(cfg.get("pauseTimeoutMs") or 0),
        "pauseMessage": cfg.get("pauseMessage")
        or "京东可能会出现安全验证/登录。请在浏览器里完成验证后，保持页面不关闭；skill 会自动检测到商品列表出现后继续抓取价格...",
        # Trace
        "tracePath": str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()),
        "traceAppend": False,
    }

    # Avoid sending null keys that confuse some JS code paths.
    if payload.get("storageStatePath") is None:
        payload.pop("storageStatePath", None)

    out = run_rpaskill_ts(ctx, action="searchOnSite", payload=payload)

    # Index the session state if it was saved.
    if storage_state_path.exists():
        ctx.artifacts.record_path(storage_state_path, scope="shared", kind="storage_state", data={"site": "jd.com"})
        try:
            ctx.events.emit(
                "session.saved",
                message="JD storageState saved (for future runs)",
                scope="agent",
                data={"path": str(storage_state_path)},
            )
        except Exception:
            pass

    # Persist a friendly, stable artifact for later AI querying.
    ctx.artifacts.write_json("jd_aircon_prices.json", out, scope="agent")
    return {"status": "ok", "keyword": keyword, "searchUrl": search_url, "result": out}
