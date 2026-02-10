from __future__ import annotations

import json
from typing import Any

from .common.runner import run_rpaskill_ts, run_rpaskill_ts_session

def _coerce_bool(v: object) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on")


def _parse_loose_kv_object(text: str) -> dict[str, Any] | None:
    """
    Parse a loose object format like: {enabled:true,command:status,port:38200}

    This makes PowerShell-friendly `--set session={...}` usable without fragile quoting.
    """
    t = (text or "").strip()
    if not (t.startswith("{") and t.endswith("}")):
        return None
    body = t[1:-1].strip()
    if not body:
        return {}

    out: dict[str, Any] = {}
    for part in body.split(","):
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        k = k.strip().strip('"').strip("'")
        v = v.strip().strip('"').strip("'")
        if not k:
            continue
        vl = v.lower()
        if vl in ("true", "false"):
            out[k] = vl == "true"
        else:
            try:
                if "." in v:
                    out[k] = float(v)
                else:
                    out[k] = int(v)
            except Exception:
                out[k] = v
    return out


def run(ctx) -> dict[str, Any]:
    """
    Bridge skill: runs the TypeScript/Node RPASkill integration via a small Node runner.

    This lets you keep the heavy Playwright automation logic in TS while the platform stays Python.
    """
    cfg = ctx.config or {}
    action = cfg.get("action", "adaptiveSearch")
    action = str(action)

    input_payload = dict(cfg)

    # Session mode: keep a single browser open across multiple invocations within the same run_id.
    # This is the main path for "human-in-the-loop" login/captcha workflows where you want to keep
    # the browser window visible and reuse the same cookies.
    session_cfg: dict[str, Any] | None = None
    if isinstance(input_payload.get("session"), dict):
        session_cfg = dict(input_payload.get("session") or {})
    elif isinstance(input_payload.get("session"), str):
        session_cfg = _parse_loose_kv_object(str(input_payload.get("session"))) or None

    # Also accept PowerShell-friendly flat overrides like: --set session.command=start
    # (run.py will treat the whole key as a string).
    for k in list(input_payload.keys()):
        if not isinstance(k, str) or not k.startswith("session."):
            continue
        if session_cfg is None:
            session_cfg = {}
        session_cfg[k[len("session.") :]] = input_payload[k]
        # Remove flattened keys so they don't leak into action option payloads.
        try:
            del input_payload[k]
        except Exception:
            pass

    if session_cfg is not None:
        input_payload["session"] = session_cfg

    session_enabled = bool(session_cfg) and _coerce_bool(session_cfg.get("enabled", True))
    session_command = str((session_cfg or {}).get("command") or "call").lower() if session_cfg else "call"

    # Start/close/status are session-management commands; they don't need action-specific defaults.
    if session_enabled and session_command in ("start", "open", "close", "stop", "shutdown", "status", "health"):
        out = run_rpaskill_ts_session(ctx, action=action, payload=input_payload)
        return {"status": "ok", "action": action, "rpaskill_ts_session": out}

    if action in ("webSearch", "adaptiveSearch"):
        query = input_payload.get("query")
        if not query:
            raise ValueError("config.yaml must include `query` for rpa_ts_skill when action is webSearch/adaptiveSearch")
        input_payload["query"] = query
        input_payload.setdefault("tracePath", str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()))
    elif action == "inspectPage":
        url = input_payload.get("url")
        if not url:
            raise ValueError("config.yaml must include `url` for rpa_ts_skill when action is inspectPage")
        input_payload["url"] = url
        input_payload.setdefault("tracePath", str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()))
        input_payload.setdefault("capturePrefix", str((ctx.outputs_dir / "captures" / "page").resolve()))
        input_payload.setdefault("captureFullPage", True)
        input_payload.setdefault("includeHtml", True)
        input_payload.setdefault("includeAccessibility", True)
        input_payload.setdefault("includeElements", True)
        input_payload.setdefault("detectBlockers", True)
        # When pausing for a human, default to showing the browser window.
        if bool(input_payload.get("pauseForHuman")) and "headless" not in input_payload:
            input_payload["headless"] = False
    else:
        # For other actions (e.g. searchOnSite), just pass config through.
        input_payload.setdefault("tracePath", str((ctx.outputs_dir / "rpa_trace.jsonl").resolve()))

    if session_enabled:
        out = run_rpaskill_ts_session(ctx, action=action, payload=input_payload)
        return {"status": "ok", "action": action, "rpaskill_ts_session": out}

    out = run_rpaskill_ts(ctx, action=action, payload=input_payload)

    status = "ok"
    try:
        if action == "inspectPage" and bool(out.get("response", {}).get("blocked")):
            status = "needs_human"
    except Exception:
        status = "ok"

    return {
        "status": status,
        "action": action,
        "rpaskill_ts": out,
    }
