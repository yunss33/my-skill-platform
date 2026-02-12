from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

from skills.rpa_ts_skill.common.runner import run_rpaskill_ts


_PRICE_RE = re.compile(r"([0-9]{1,8}(?:\\.[0-9]{1,2})?)")


def _to_number(price_text: object) -> float | None:
    if price_text is None:
        return None
    s = str(price_text)
    # Normalize common currency chars/spaces.
    s = s.replace("￥", "").replace("¥", "").replace(",", "").strip()
    m = _PRICE_RE.search(s)
    if not m:
        return None
    try:
        v = float(m.group(1))
        return v if v > 0 else None
    except Exception:
        return None


def _iter_records(obj: Any) -> Iterable[dict[str, Any]]:
    if isinstance(obj, dict) and isinstance(obj.get("response"), list):
        # Node runner output: {"ok":true,"action":...,"response":[...]}
        for it in obj["response"]:
            if isinstance(it, dict):
                yield it
        return
    if isinstance(obj, list):
        for it in obj:
            if isinstance(it, dict):
                yield it
        return


def _pick_cheapest(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_price: float | None = None
    for r in rows:
        p = _to_number(r.get("price"))
        if p is None:
            continue
        if best is None or (best_price is not None and p < best_price) or best_price is None:
            best = r
            best_price = p
    if best is None:
        return None
    out = dict(best)
    out["_priceNumber"] = best_price
    return out


def run(ctx) -> dict[str, Any]:
    cfg = ctx.config or {}
    keyword = str(cfg.get("keyword") or "苹果15手机").strip()
    limit_per_site = int(cfg.get("limit_per_site") or 30)
    account = str(cfg.get("profileAccount") or cfg.get("account") or cfg.get("profile") or "default").strip()
    account = re.sub(r"[^A-Za-z0-9._-]+", "_", account) or "default"

    common_browser: dict[str, Any] = {
        "headless": bool(cfg.get("headless", False)),
        "channel": cfg.get("channel") or "msedge",
        "slowMo": int(cfg.get("slowMo") or 0),
        "args": cfg.get("args") or [],
        "viewport": cfg.get("viewport", None),
    }

    common_control: dict[str, Any] = {
        "pauseForHuman": bool(cfg.get("pauseForHuman", True)),
        "pauseForHumanMode": str(cfg.get("pauseForHumanMode") or "auto"),
        "pauseTimeoutMs": int(cfg.get("pauseTimeoutMs") or 0),
        "stepDelayMs": int(cfg.get("stepDelayMs") or 900),
        "stepDelayJitterMs": int(cfg.get("stepDelayJitterMs") or 700),
        "captureFullPage": bool(cfg.get("captureFullPage", True)),
        "includeHtml": bool(cfg.get("includeHtml", True)),
        "includeElements": bool(cfg.get("includeElements", True)),
        "maxElements": int(cfg.get("maxElements") or 350),
        "captureOnBlocked": bool(cfg.get("captureOnBlocked", True)),
        "captureOnDone": bool(cfg.get("captureOnDone", True)),
        "detectBlockers": bool(cfg.get("detectBlockers", True)),
        "resultsTimeout": int(cfg.get("resultsTimeout") or 120000),
        "afterSearchDelayMs": int(cfg.get("afterSearchDelayMs") or 3000),
    }

    all_rows: list[dict[str, Any]] = []
    per_site: dict[str, Any] = {}

    # JD (new)
    if bool(cfg.get("enable_jd", True)):
        jd_search_url = f"https://search.jd.com/Search?keyword={quote(keyword)}&enc=utf-8"
        jd_profile_dir = (ctx.platform.deps_dir / "browser_profiles" / "jd" / account).resolve()
        jd_profile_dir.mkdir(parents=True, exist_ok=True)
        jd_storage_state = (ctx.platform.deps_dir / "storage_states" / "jd" / f"{account}.json").resolve()
        jd_storage_state.parent.mkdir(parents=True, exist_ok=True)

        payload: dict[str, Any] = {
            "searchUrl": jd_search_url,
            "resultsWaitFor": "#J_goodsList .gl-item",
            "waitForLoadState": "domcontentloaded",
            "limit": limit_per_site,
            "screenshotPath": str((ctx.outputs_dir / "screenshots" / "jd_search.png").resolve()),
            "capturePrefix": str((ctx.outputs_dir / "captures" / "jd_search").resolve()),
            "list": {
                "itemSelector": "#J_goodsList .gl-item",
                "fields": {
                    "title": {"selector": ".p-name em", "attr": "text"},
                    "price": {"selector": ".p-price i", "attr": "text"},
                    "link": {"selector": ".p-name a", "attr": "href"},
                },
            },
            "userDataDir": str(jd_profile_dir),
            "storageStatePath": str(jd_storage_state) if jd_storage_state.exists() else None,
            "saveStorageStatePath": str(jd_storage_state),
            "tracePath": str((ctx.outputs_dir / "jd_rpa_trace.jsonl").resolve()),
            "traceAppend": False,
            **common_browser,
            **common_control,
            "pauseMessage": cfg.get("jd_pauseMessage")
            or "京东可能会出现『访问频繁/安全验证/登录』。请在浏览器里处理后保持页面不关闭，脚本会继续抓取商品列表。",
        }
        if payload.get("storageStatePath") is None:
            payload.pop("storageStatePath", None)

        jd_out = run_rpaskill_ts(ctx, action="searchOnSite", payload=payload)
        jd_rows = []
        for r in _iter_records(jd_out):
            rec = dict(r)
            rec["site"] = "jd"
            jd_rows.append(rec)
        per_site["jd"] = {"searchUrl": jd_search_url, "rows": jd_rows}
        all_rows.extend(jd_rows)

    # PDD (new)
    if bool(cfg.get("enable_pdd", True)):
        pdd_search_url = f"https://mobile.yangkeduo.com/search_result.html?search_key={quote(keyword)}"
        pdd_profile_dir = (ctx.platform.deps_dir / "browser_profiles" / "pdd" / account).resolve()
        pdd_profile_dir.mkdir(parents=True, exist_ok=True)
        pdd_storage_state = (ctx.platform.deps_dir / "storage_states" / "pdd" / f"{account}.json").resolve()
        pdd_storage_state.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "searchUrl": pdd_search_url,
            "resultsWaitFor": str(cfg.get("pdd_resultsWaitFor") or r"text=/[￥¥]\s*\d/"),
            "waitForLoadState": "domcontentloaded",
            "limit": limit_per_site,
            "scrollSteps": int(cfg.get("pdd_scrollSteps") or 6),
            "scrollDelayMs": int(cfg.get("pdd_scrollDelayMs") or 1200),
            "screenshotPath": str((ctx.outputs_dir / "screenshots" / "pdd_search.png").resolve()),
            "capturePrefix": str((ctx.outputs_dir / "captures" / "pdd_search").resolve()),
            "userDataDir": str(pdd_profile_dir),
            "storageStatePath": str(pdd_storage_state) if pdd_storage_state.exists() else None,
            "saveStorageStatePath": str(pdd_storage_state),
            "tracePath": str((ctx.outputs_dir / "pdd_rpa_trace.jsonl").resolve()),
            "traceAppend": False,
            **common_browser,
            **common_control,
            "pauseMessage": cfg.get("pdd_pauseMessage")
            or "拼多多可能会出现验证码/安全验证/登录。请在浏览器里完成后保持页面不关闭，脚本会继续抓取价格列表。",
        }
        if payload.get("storageStatePath") is None:
            payload.pop("storageStatePath", None)

        pdd_out = run_rpaskill_ts(ctx, action="searchProductsHeuristic", payload=payload)
        pdd_rows = []
        for r in _iter_records(pdd_out):
            rec = dict(r)
            rec["site"] = "pdd"
            pdd_rows.append(rec)
        per_site["pdd"] = {"searchUrl": pdd_search_url, "rows": pdd_rows}
        all_rows.extend(pdd_rows)

    cheapest = _pick_cheapest(all_rows)

    result = {
        "status": "ok",
        "keyword": keyword,
        "profileAccount": account,
        "cheapest": cheapest,
        "total": len(all_rows),
        "per_site": per_site,
    }

    # Stable pointer
    try:
        marker_path = (ctx.platform.root_dir / "outputs" / "iphone15_best_price_skill" / "_latest.json").resolve()
        marker_path.parent.mkdir(parents=True, exist_ok=True)
        marker_path.write_text(
            (
                "{\n"
                f'  "ts": "{datetime.now(timezone.utc).isoformat().replace("+00:00","Z")}",\n'
                f'  "run_id": "{ctx.run_id}",\n'
                f'  "agent_id": "{ctx.agent_id}",\n'
                f'  "outputs_dir": "{str(Path(ctx.outputs_dir).resolve()).replace("\\\\","\\\\\\\\")}"\n'
                "}\n"
            ),
            encoding="utf-8",
        )
    except Exception:
        pass

    ctx.artifacts.write_json("iphone15_best_price.json", result, scope="agent")
    return result

