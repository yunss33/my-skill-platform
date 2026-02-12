from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
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

    def _write_latest_marker(*, action_name: str, payload: dict[str, Any], result: dict[str, Any]) -> None:
        """
        Write a stable pointer file so the agent can auto-locate the most recent run's artifacts
        without the user needing to paste paths/screenshots.
        """
        try:
            skill_root = ctx.platform.root_dir / "outputs" / str(ctx.skill.name)
            skill_root.mkdir(parents=True, exist_ok=True)
            marker_path = skill_root / "_latest.json"

            # Best-effort guesses to help locate artifacts quickly.
            captures_dir = ctx.outputs_dir / "captures"
            screenshots_dir = ctx.outputs_dir / "screenshots"

            marker = {
                "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "skill": str(ctx.skill.name),
                "run_id": str(ctx.run_id),
                "agent_id": str(ctx.agent_id),
                "action": str(action_name),
                "paths": {
                    "outputs_dir": str(Path(ctx.outputs_dir).resolve()),
                    "shared_dir": str(Path(ctx.shared_dir).resolve()),
                    "work_dir": str(Path(ctx.work_dir).resolve()),
                    "captures_dir": str(captures_dir.resolve()),
                    "screenshots_dir": str(screenshots_dir.resolve()),
                    "trace_path": str(payload.get("tracePath") or ""),
                    "capture_prefix": str(payload.get("capturePrefix") or ""),
                },
                # Keep payload small but useful (avoid dumping large lists).
                "payload_hints": {
                    "url": payload.get("url"),
                    "searchUrl": payload.get("searchUrl"),
                    "query": payload.get("query"),
                    "resultsWaitFor": payload.get("resultsWaitFor"),
                    "pauseForHuman": payload.get("pauseForHuman"),
                    "pauseForHumanMode": payload.get("pauseForHumanMode"),
                    "stepDelayMs": payload.get("stepDelayMs"),
                    "stepDelayJitterMs": payload.get("stepDelayJitterMs"),
                    "typeDelayMs": payload.get("typeDelayMs"),
                    "typeDelayJitterMs": payload.get("typeDelayJitterMs"),
                },
                "result_hints": {
                    "status": result.get("status"),
                },
            }
            marker_path.write_text(json.dumps(marker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception:
            # Never break the skill due to marker writes.
            return

    cfg = ctx.config or {}
    action = cfg.get("action", "adaptiveSearch")
    action = str(action)

    input_payload = dict(cfg)

    # Optional multi-login support:
    # If the caller provides profileSite/profileAccount (or site/account), we map that to a stable
    # Playwright persistent profile directory. This enables "reuse login state" across runs.
    # Convention:
    #   runtime/deps/browser_profiles/<site>/<account>/
    profile_site_raw = str(input_payload.get("profileSite") or input_payload.get("site") or "").strip()
    profile_account_raw = str(
        input_payload.get("profileAccount") or input_payload.get("account") or input_payload.get("profile") or ""
    ).strip()
    if (profile_site_raw or profile_account_raw) and not input_payload.get("userDataDir"):
        profile_site = re.sub(r"[^A-Za-z0-9._-]+", "_", profile_site_raw or "default_site") or "default_site"
        profile_account = re.sub(r"[^A-Za-z0-9._-]+", "_", profile_account_raw or "default") or "default"
        profile_dir = (ctx.platform.deps_dir / "browser_profiles" / profile_site / profile_account).resolve()
        profile_dir.mkdir(parents=True, exist_ok=True)
        input_payload["userDataDir"] = str(profile_dir)

        # Also keep a storageState snapshot updated (useful for backup/export; userDataDir is the main mechanism).
        storage_state_path = (ctx.platform.deps_dir / "storage_states" / profile_site / f"{profile_account}.json").resolve()
        storage_state_path.parent.mkdir(parents=True, exist_ok=True)
        if storage_state_path.exists() and not input_payload.get("storageStatePath"):
            input_payload["storageStatePath"] = str(storage_state_path)
        # Always attempt to save an updated snapshot after the run (works for non-session runs;
        # session runs will save it best-effort via run_rpaskill_ts_session).
        input_payload.setdefault("saveStorageStatePath", str(storage_state_path))

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
        res = {"status": "ok", "action": action, "rpaskill_ts_session": out}
        _write_latest_marker(action_name=action, payload=input_payload, result=res)
        return res

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
        res = {"status": "ok", "action": action, "rpaskill_ts_session": out}
        _write_latest_marker(action_name=action, payload=input_payload, result=res)
        return res

    out = run_rpaskill_ts(ctx, action=action, payload=input_payload)

    status = "ok"
    try:
        if action == "inspectPage" and bool(out.get("response", {}).get("blocked")):
            status = "needs_human"
    except Exception:
        status = "ok"

    res = {
        "status": status,
        "action": action,
        "rpaskill_ts": out,
    }
    _write_latest_marker(action_name=action, payload=input_payload, result=res)
    return res
