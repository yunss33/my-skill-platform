from __future__ import annotations

"""
CNKI (知网) AI trends helper (session mode).

This script assumes a long-lived RPASkill TS session_server is already running and its
baseUrl is recorded under:
  outputs/rpa_ts_run_profile/<run_id>/shared/rpa_ts_session.json

It will:
1) Wait until CNKI security verification is cleared (user must solve slider/captcha manually).
2) Navigate to CNKI Advanced Search, perform a query, and capture artifacts (screenshot/html/elements).
3) Parse visible link elements from the result page and write a small markdown report.

Notes:
- This script does NOT attempt to bypass captcha/verification. It only waits and continues.
- CNKI pages/DOM often change; selectors are best-effort.
"""

import json
import argparse
import html as _html
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib import request


@dataclass
class SessionState:
    base_url: str


def _utc_ts() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _http_json_post(url: str, payload: dict[str, Any], timeout_s: float = 60.0) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={"content-type": "application/json; charset=utf-8"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def call(session: SessionState, method: str, params: Any) -> Any:
    # session_server accepts either list params or a single object; prefer list for multi-arg methods.
    res = _http_json_post(f"{session.base_url.rstrip('/')}/call", {"method": method, "params": params})
    if not res.get("ok"):
        raise RuntimeError(f"session call failed: {res.get('error')}")
    return res.get("result")


def _load_session_state(root: Path, run_id: str) -> SessionState:
    p = root / "outputs" / "rpa_ts_run_profile" / run_id / "shared" / "rpa_ts_session.json"
    obj = _read_json(p)
    base_url = str(obj.get("baseUrl") or "").strip()
    if not base_url:
        raise RuntimeError(f"Missing baseUrl in session state: {p}")
    return SessionState(base_url=base_url)


def _looks_like_verify(url: str) -> bool:
    u = (url or "").lower()
    return "verify/home" in u or "captcha" in u or "ident=" in u


def wait_until_not_verify(session: SessionState, *, timeout_s: float = 600.0, poll_s: float = 2.5) -> str:
    deadline = time.time() + timeout_s
    last = ""
    while time.time() < deadline:
        try:
            last = str(call(session, "getUrl", []))
        except Exception:
            last = ""
        if last and not _looks_like_verify(last):
            return last
        time.sleep(poll_s)
    raise TimeoutError(f"Timed out waiting for verification to clear. last_url={last!r}")


def pick_best_text(items: Iterable[str]) -> str:
    best = ""
    for s in items:
        t = str(s or "").strip()
        if len(t) > len(best):
            best = t
    return best


def parse_visible_links(elements_path: Path) -> list[dict[str, str]]:
    obj = _read_json(elements_path)
    elements = obj.get("elements") if isinstance(obj, dict) else None
    out: list[dict[str, str]] = []
    if not isinstance(elements, list):
        return out

    seen: set[str] = set()
    for el in elements:
        if not isinstance(el, dict):
            continue
        if str(el.get("tag") or "").lower() != "a":
            continue
        href = str(el.get("href") or "").strip()
        text = str(el.get("text") or "").strip()
        if not href or not text:
            continue
        if href in seen:
            continue
        seen.add(href)
        out.append({"title": text, "url": href})
    return out


def _safe_get(items: list[str], i: int) -> str:
    if 0 <= i < len(items):
        return str(items[i] or "").strip()
    return ""


def main() -> int:
    root = Path(__file__).resolve().parents[1]

    ap = argparse.ArgumentParser(description="CNKI (知网) Advanced Search helper (session mode)")
    ap.add_argument("--run-id", default="cnki_ai_recent", help="rpa_ts_run_profile run id (session server)")
    ap.add_argument(
        "--query",
        default=(
            # Keep this ASCII-only so it survives messy Windows console encodings.
            "\u4eba\u5de5\u667a\u80fd "
            "\u5927\u8bed\u8a00\u6a21\u578b "
            "\u751f\u6210\u5f0f "
            "\u591a\u6a21\u6001 "
            "\u7efc\u8ff0 "
            "\u8fdb\u5c55 "
            "\u8d8b\u52bf"
        ),
        help="主题/关键词检索词。若终端编码异常，优先用英文/或使用 unicode 转义。",
    )
    ap.add_argument("--max-items", type=int, default=20, help="Max result rows to include in report")
    ap.add_argument("--type-delay-ms", type=int, default=120, help="Typing delay (ms) to reduce anti-bot risk")
    args = ap.parse_args()

    run_id = str(args.run_id)

    session = _load_session_state(root, run_id=run_id)

    # Step 1: open Advanced Search (this may redirect to verification)
    adv_url = "https://kns.cnki.net/kns8s/AdvSearch"
    call(
        session,
        "inspectPage",
        {
            "url": adv_url,
            "waitUntil": "domcontentloaded",
            "waitForSelector": "body",
            "timeout": 60000,
            "captureFullPage": True,
            "includeHtml": True,
            "includeElements": True,
            "maxElements": 400,
            "detectBlockers": True,
            # keep capture files in the run output dir for easy discovery
            "capturePrefix": str(
                (root / "outputs" / "rpa_ts_run_profile" / run_id / "agents" / "agent0" / "captures" / "cnki_adv")
                .resolve()
            ),
        },
    )

    # Step 2: wait for manual verification
    print("CNKI: if you see a slider/captcha, solve it in the browser window. Waiting...")
    current = wait_until_not_verify(session, timeout_s=900.0, poll_s=2.5)
    print("CNKI: verification cleared (or not detected). current_url:", current)

    # Step 3: perform a best-effort query on Advanced Search page.
    # NOTE: CNKI advanced search DOM changes often; selectors are heuristic.
    query = str(args.query)

    # Ensure we are on adv page again.
    call(session, "navigate", [adv_url, {"waitUntil": "domcontentloaded", "timeout": 60000}])
    time.sleep(1.0)

    # Try common input selectors on CNKI.
    input_selectors = [
        # CNKI adv search commonly uses data-tipid for the main keyword inputs.
        '.gradeSearch input[data-tipid="gradetxt-1"]',
        'input[data-tipid="gradetxt-1"]',
        '.gradeSearch input[data-tipid="gradetxt-2"]',
        'input[data-tipid="gradetxt-2"]',
        '.gradeSearch input[data-tipid="gradetxt-3"]',
        'input[data-tipid="gradetxt-3"]',
        "input[placeholder*='主题']",
        "input[placeholder*='关键词']",
        "input[type='text']",
    ]

    filled = False
    used_sel = ""
    for sel in input_selectors:
        try:
            # Prefer fill() so non-ASCII text is set correctly, then trigger events.
            call(session, "click", [sel, {"timeout": 3000}])
            call(session, "input", [sel, "", {"timeout": 3000}])
            call(session, "input", [sel, query, {"timeout": 10000}])
            # Trigger input listeners (CNKI sometimes depends on key events)
            call(session, "press", ["Space", {"delay": 40}])
            call(session, "press", ["Backspace", {"delay": 40}])
            filled = True
            used_sel = sel
            break
        except Exception:
            continue

    if not filled:
        print("WARN: could not find the query input reliably. Capturing page for debugging...")

    # Try common search buttons
    button_selectors = [
        "div.search-buttons input.btn-search",
        "button:has-text('检索')",
        "button:has-text('搜索')",
        "a:has-text('检索')",
        "a:has-text('搜索')",
        "input.btn-search",
        "input.search-btn",
        "#btnSearch",
        "input[type='submit']",
    ]

    clicked = False
    for sel in button_selectors:
        try:
            call(session, "click", [sel, {"timeout": 5000, "force": True}])
            clicked = True
            break
        except Exception:
            continue

    if not clicked:
        print("WARN: could not click search button reliably. You may need to click it manually in the browser.")
    else:
        # Best-effort Enter submit too; some layouts respond to Enter even if click is intercepted.
        try:
            if used_sel:
                call(session, "click", [used_sel, {"timeout": 2000}])
            call(session, "press", ["Enter", {"delay": 50}])
        except Exception:
            pass

    # Step 4: wait for result table to appear.
    # CNKI often keeps URL under /AdvSearch while rendering results below.
    try:
        call(session, "waitForSelector", ["#gridTable table.result-table-list", {"timeout": 60000}])
    except Exception:
        time.sleep(5.0)

    cap_prefix = (
        root
        / "outputs"
        / "rpa_ts_run_profile"
        / run_id
        / "agents"
        / "agent0"
        / "captures"
        / f"cnki_results_live_{int(time.time()*1000)}"
    )

    # IMPORTANT: Do NOT call inspectPage() here.
    # inspectPage() will do a page.goto(url) which reloads CNKI and may erase the current search results
    # (CNKI often renders results under the same /AdvSearch URL using in-page state).
    result_url = str(call(session, "getUrl", []))

    # Capture "what we see" + "DOM snapshot" for debugging / multimodal post-analysis.
    screenshot_path = str(Path(f"{cap_prefix}_screenshot.png").resolve())
    html_path = str(Path(f"{cap_prefix}_page.html").resolve())
    try:
        call(session, "captureScreenshot", [screenshot_path])
    except Exception as e:
        print("WARN: captureScreenshot failed:", e)
    try:
        page_html = str(call(session, "extractPageSource", []))
        _write_text(Path(html_path), page_html)
    except Exception as e:
        print("WARN: extractPageSource failed:", e)

    # Step 5: Extract structured results (more reliable than "visible links").
    titles: list[str] = []
    urls: list[str] = []
    authors: list[str] = []
    sources: list[str] = []
    dates: list[str] = []
    try:
        titles = call(session, "extractAllText", ["#gridTable table.result-table-list tbody tr td.name a.fz14", {}]) or []
        urls = call(
            session,
            "extractAllAttributes",
            ["#gridTable table.result-table-list tbody tr td.name a.fz14", "href", {}],
        ) or []
        authors = call(session, "extractAllText", ["#gridTable table.result-table-list tbody tr td.author", {}]) or []
        sources = call(session, "extractAllText", ["#gridTable table.result-table-list tbody tr td.source", {}]) or []
        dates = call(session, "extractAllText", ["#gridTable table.result-table-list tbody tr td.date", {}]) or []
    except Exception as e:
        print("WARN: failed to extract structured results:", e)

    # Extract a lightweight "element map" (subset) from the results table.
    # This is a practical replacement for inspectPage(includeElements=true) in session flows.
    element_map: dict[str, Any] = {"url": result_url, "ts": _utc_ts(), "titleLinks": []}
    try:
        op_texts = call(
            session,
            "extractAllText",
            ["#gridTable table.result-table-list tbody tr td.operat a", {}],
        ) or []
        op_hrefs = call(
            session,
            "extractAllAttributes",
            ["#gridTable table.result-table-list tbody tr td.operat a", "href", {}],
        ) or []
        element_map["opLinksSample"] = [
            {"text": _safe_get(op_texts, i), "href": _safe_get(op_hrefs, i)} for i in range(min(30, len(op_hrefs)))
        ]
    except Exception:
        # best-effort
        pass

    for i in range(min(len(titles), len(urls), int(args.max_items))):
        element_map["titleLinks"].append({"title": _safe_get(titles, i), "href": _safe_get(urls, i)})

    elements_json_path = str(Path(f"{cap_prefix}_elements.json").resolve())
    try:
        _write_text(Path(elements_json_path), json.dumps(element_map, ensure_ascii=False, indent=2))
    except Exception:
        pass

    # Compose report
    report_dir = root / "outputs" / "cnki_ai_recent"
    report_path = report_dir / "report.md"
    lines = []
    lines.append(f"# CNKI 最近 AI 发展情况（自动抓取草稿）")
    lines.append("")
    lines.append(f"- ts: {_utc_ts()}")
    lines.append(f"- query: {query}")
    lines.append(f"- sessionRunId: {run_id}")
    lines.append(f"- resultPageUrl: {result_url}")
    lines.append(f"- capturePrefix: {cap_prefix}")
    lines.append(f"- screenshot: {screenshot_path}")
    lines.append(f"- html: {html_path}")
    lines.append(f"- elements: {elements_json_path}")
    lines.append("")

    if titles and urls:
        lines.append("## 检索结果（结构化提取：题名/作者/来源/时间）")
        lines.append("")
        n = min(int(args.max_items), len(titles), len(urls))
        for i in range(n):
            t = _html.unescape(_safe_get(titles, i))
            u = _safe_get(urls, i)
            a = " ".join(_safe_get(authors, i).split())
            s = " ".join(_safe_get(sources, i).split())
            d = _safe_get(dates, i)
            lines.append(f"{i+1}. {t}")
            if a:
                lines.append(f"   - 作者: {a}")
            if s:
                lines.append(f"   - 来源: {s}")
            if d:
                lines.append(f"   - 时间: {d}")
            if u:
                lines.append(f"   - {u}")
        lines.append("")

    if not titles or not urls:
        lines.append("(未能自动提取到结果列表；可能仍在验证页/或 DOM 结构变化。请查看 captures 里的 screenshot/html/elements.json)")

    _write_text(report_path, "\n".join(lines) + "\n")
    print("Wrote report:", report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
