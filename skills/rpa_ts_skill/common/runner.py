from __future__ import annotations

import json
import os
import socket
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def _find_node() -> str:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js not found in PATH. Install Node to run TS-based skills.")
    return node


def _iter_jsonl(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    except Exception:
        return []
    return out


def _json_http(method: str, url: str, payload: dict[str, Any] | None = None, timeout_s: float = 5.0) -> dict[str, Any]:
    data = None
    headers = {"accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["content-type"] = "application/json; charset=utf-8"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return json.loads(raw)
            except Exception:
                return {"ok": False, "error": f"non-json response: {raw[:2000]}"}
    except urllib.error.HTTPError as e:
        try:
            raw = e.read().decode("utf-8", errors="replace")
        except Exception:
            raw = str(e)
        return {"ok": False, "error": f"http {e.code}: {raw[:2000]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _pick_free_port() -> int:
    # Best-effort free port selection (no lock yet).
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])
    finally:
        try:
            s.close()
        except Exception:
            pass


def _session_state_path(ctx) -> Path:
    # Shared so multiple agents can reuse a single browser session.
    return ctx.shared_dir / "rpa_ts_session.json"


def _load_session_state(path: Path) -> dict[str, Any] | None:
    try:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_session_state(path: Path, state: dict[str, Any] | None) -> None:
    try:
        if state is None:
            if path.exists():
                path.unlink()
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        # best-effort
        return


def _is_session_healthy(base_url: str, timeout_s: float = 1.5) -> bool:
    res = _json_http("GET", f"{base_url.rstrip('/')}/health", timeout_s=timeout_s)
    return bool(res.get("ok"))


def _browser_options_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    keys = {
        "headless",
        "channel",
        "executablePath",
        "slowMo",
        "timeout",
        "proxy",
        "args",
        "viewport",
        "userDataDir",
        "storageStatePath",
    }
    out: dict[str, Any] = {}
    for k in keys:
        if k in payload:
            out[k] = payload.get(k)
    return out


def _action_options_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    # Remove browser init options so we don't accidentally pass them into action methods.
    drop = {
        "headless",
        "channel",
        "executablePath",
        "slowMo",
        "timeout",
        "proxy",
        "args",
        "viewport",
        "userDataDir",
        "storageStatePath",
        "saveStorageStatePath",
        "session",
    }
    return {k: v for k, v in payload.items() if k not in drop}


def _ensure_session_server(ctx, *, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Ensure a long-lived Node session_server is running for this run_id.

    We store session info under ctx.shared_dir so multiple agents can reuse it.
    """
    state_path = _session_state_path(ctx)
    existing = _load_session_state(state_path)
    if existing and existing.get("baseUrl") and _is_session_healthy(str(existing["baseUrl"])):
        return existing

    integration_root = ctx.platform.root_dir / "integrations" / "rpaskill_ts"
    server_js = integration_root / "cli" / "session_server.mjs"
    if not server_js.exists():
        raise FileNotFoundError(f"Missing Node session server: {server_js}")

    sess = payload.get("session") if isinstance(payload.get("session"), dict) else {}
    host = str((sess or {}).get("host") or "127.0.0.1")
    port = int((sess or {}).get("port") or _pick_free_port())

    # Prefer a shared profile to persist login across multiple invocations/agents.
    user_data_scope = str((sess or {}).get("userDataScope") or "shared").lower()
    if payload.get("userDataDir"):
        user_data_dir = Path(str(payload["userDataDir"]))
    elif user_data_scope == "agent":
        user_data_dir = ctx.agent_dir / "pw_user_data"
    else:
        user_data_dir = ctx.shared_dir / "pw_user_data"
    user_data_dir.mkdir(parents=True, exist_ok=True)

    node = _find_node()
    browser_opts = _browser_options_from_payload(payload)

    # Default to visible browser in session mode (user can still override via payload.headless).
    if "headless" not in browser_opts or browser_opts.get("headless") is None:
        browser_opts["headless"] = False

    cmd = [
        node,
        str(server_js),
        "--host",
        host,
        "--port",
        str(port),
        "--headless",
        "true" if bool(browser_opts.get("headless")) else "false",
        "--userDataDir",
        str(user_data_dir.resolve()),
    ]
    if browser_opts.get("channel"):
        cmd += ["--channel", str(browser_opts["channel"])]
    if browser_opts.get("executablePath"):
        cmd += ["--executablePath", str(browser_opts["executablePath"])]
    if browser_opts.get("slowMo") is not None:
        cmd += ["--slowMo", str(int(browser_opts.get("slowMo") or 0))]
    if browser_opts.get("timeout") is not None:
        cmd += ["--timeout", str(int(browser_opts.get("timeout") or 0))]
    if browser_opts.get("storageStatePath"):
        cmd += ["--storageStatePath", str(browser_opts["storageStatePath"])]
    if browser_opts.get("viewport") is not None:
        cmd += ["--viewport", json.dumps(browser_opts["viewport"], ensure_ascii=False)]
    if browser_opts.get("args"):
        cmd += ["--args", json.dumps(browser_opts["args"], ensure_ascii=False)]

    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = env.get("PLAYWRIGHT_BROWSERS_PATH", str(ctx.platform.playwright_browsers_dir))

    # Keep server logs as artifacts for later debugging/querying.
    server_log = ctx.artifacts.write_text("work/rpa_ts_session_server.log", "", scope="agent")
    log_fh = open(server_log, "a", encoding="utf-8", errors="replace")

    ctx.logger.info("Starting RPASkill TS session server: %s", " ".join(cmd))
    ctx.events.emit("rpaskill_ts.session.start", data={"cmd": cmd, "port": port, "host": host}, scope="agent")

    # Detach so the server (and browser) can outlive this one Python process.
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

    p = subprocess.Popen(
        cmd,
        cwd=str(integration_root),
        env=env,
        stdout=log_fh,
        stderr=log_fh,
        creationflags=creationflags,
    )
    try:
        log_fh.close()
    except Exception:
        pass

    base_url = f"http://{host}:{port}"

    # Wait until /health comes up (best-effort).
    deadline = time.time() + 25.0
    while time.time() < deadline:
        if _is_session_healthy(base_url, timeout_s=0.7):
            break
        time.sleep(0.25)

    state = {
        "baseUrl": base_url,
        "host": host,
        "port": port,
        "pid": p.pid,
        "userDataDir": str(user_data_dir.resolve()),
        "startedAt": time.time(),
    }
    _save_session_state(state_path, state)
    ctx.artifacts.record_path(state_path, scope="shared", kind="session", data={"tool": "rpaskill_ts"})

    if not _is_session_healthy(base_url, timeout_s=1.0):
        ctx.logger.warning("Session server not healthy yet at %s (pid=%s). It may still be starting.", base_url, p.pid)

    return state


def _close_session_server(ctx, *, state: dict[str, Any]) -> dict[str, Any]:
    base_url = str(state.get("baseUrl") or "").rstrip("/")
    if base_url:
        _json_http("POST", f"{base_url}/close", payload={}, timeout_s=2.5)

    # If it didn't exit, kill as a last resort (best-effort; no locks yet).
    pid = state.get("pid")
    if isinstance(pid, int) and pid > 0 and os.name == "nt":
        try:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True)
        except Exception:
            pass

    _save_session_state(_session_state_path(ctx), None)
    ctx.events.emit("rpaskill_ts.session.closed", data={"baseUrl": base_url, "pid": pid}, scope="agent")
    return {"ok": True, "closed": True, "baseUrl": base_url, "pid": pid}


def run_rpaskill_ts(ctx, *, action: str, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Run the TypeScript RPASkill integration via Node runner and return the decoded JSON output.
    """
    integration_root = ctx.platform.root_dir / "integrations" / "rpaskill_ts"
    runner = integration_root / "cli" / "run.mjs"
    if not runner.exists():
        raise FileNotFoundError(f"Missing Node runner: {runner}")

    # Prepare input + output files
    input_path = ctx.work_dir / f"rpaskill_ts_{action}_input.json"
    input_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    output_path = ctx.outputs_dir / f"rpaskill_ts_{action}_output.json"

    node = _find_node()
    cmd = [
        node,
        str(runner),
        "--action",
        str(action),
        "--input",
        str(input_path.resolve()),
        "--output",
        str(output_path.resolve()),
    ]

    # Pass through browser options if present
    if "headless" in payload:
        cmd += ["--headless", "true" if bool(payload.get("headless")) else "false"]
    if payload.get("channel"):
        cmd += ["--channel", str(payload["channel"])]
    if payload.get("executablePath"):
        cmd += ["--executablePath", str(payload["executablePath"])]

    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = env.get("PLAYWRIGHT_BROWSERS_PATH", str(ctx.platform.playwright_browsers_dir))

    ctx.logger.info("RPASkill TS runner: %s", " ".join(cmd))
    ctx.events.emit("rpaskill_ts.start", data={"action": action, "cmd": cmd}, scope="agent")

    interactive = bool(payload.get("pauseForHuman"))
    if interactive:
        # Let Node print its own prompts in real-time.
        if action == "inspectPage":
            hint = (
                "RPASkill is waiting for human operation in the browser. "
                "Finish actions (login/captcha/click), then return here and press Enter to continue."
            )
        else:
            hint = (
                "RPASkill is running in visible browser mode. "
                "If you hit login/captcha, complete it in the browser; the skill will auto-continue when ready."
            )
        print(hint)
        try:
            ctx.events.emit("human.hint", message=hint, scope="agent")
        except Exception:
            pass
        completed = subprocess.run(cmd, cwd=str(integration_root), env=env)
        stdout_path = ctx.artifacts.write_text(f"rpaskill_ts_{action}_stdout.txt", "", scope="agent")
        stderr_path = ctx.artifacts.write_text(f"rpaskill_ts_{action}_stderr.txt", "", scope="agent")
    else:
        completed = subprocess.run(
            cmd,
            cwd=str(integration_root),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        stdout_path = ctx.artifacts.write_text(f"rpaskill_ts_{action}_stdout.txt", completed.stdout, scope="agent")
        stderr_path = ctx.artifacts.write_text(f"rpaskill_ts_{action}_stderr.txt", completed.stderr, scope="agent")

    ctx.events.emit(
        "rpaskill_ts.end",
        data={
            "action": action,
            "returncode": completed.returncode,
            "stdout": str(stdout_path),
            "stderr": str(stderr_path),
            "output": str(output_path),
        },
        scope="agent",
    )

    if completed.returncode != 0:
        raise RuntimeError(f"rpaskill_ts failed with code {completed.returncode}. See {stderr_path}")

    out = json.loads(output_path.read_text(encoding="utf-8"))

    # Index important artifacts that were created "outside" ArtifactStore.
    ctx.artifacts.record_path(input_path, scope="agent", kind=f"rpaskill_ts.{action}.input")
    ctx.artifacts.record_path(output_path, scope="agent", kind=f"rpaskill_ts.{action}.output")

    # Optional: replay Node-side trace JSONL into events + index screenshots.
    trace_path = payload.get("tracePath")
    if trace_path:
        tp = Path(str(trace_path))
        if not tp.is_absolute():
            # Relative trace paths resolve under integration cwd; normalize to outputs dir for safety.
            tp = (ctx.outputs_dir / tp).resolve()
        if tp.exists():
            ctx.artifacts.record_path(tp, scope="agent", kind=f"rpaskill_ts.{action}.trace")
            for rec in _iter_jsonl(tp):
                ev = rec.get("event") or "trace"
                # Namespace into platform events so tools can query it.
                try:
                    ctx.events.emit(f"rpa.{ev}", data=rec, scope="agent")
                except Exception:
                    pass

                # Index any referenced files in the trace so AIs can discover them via index.jsonl.
                # Convention: fields named "*Path" or a generic "path".
                for k, v in rec.items():
                    if not isinstance(v, (str, Path)):
                        continue
                    if k != "path" and not k.endswith("Path"):
                        continue
                    if not v:
                        continue
                    p = Path(str(v))
                    if not p.is_absolute():
                        p = (ctx.outputs_dir / p).resolve()

                    kind = None
                    kl = k.lower()
                    if "screenshot" in kl:
                        kind = "screenshot"
                    elif kl in ("htmlpath", "pagesourcepath"):
                        kind = "html"
                    elif "a11y" in kl or "accessibility" in kl:
                        kind = "a11y"
                    elif "elements" in kl or "uimap" in kl:
                        kind = "ui_map"

                    ctx.artifacts.record_path(
                        p,
                        scope="agent",
                        kind=kind,
                        data={"url": rec.get("url"), "kind": rec.get("kind"), "event": ev, "field": k},
                    )
    return out


def run_rpaskill_ts_session(ctx, *, action: str, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Run the requested action by reusing a long-lived browser session (Node session_server.mjs).

    This keeps a visible browser open across multiple skill invocations (and across multiple agents
    within the same run_id), while persisting login via a shared Playwright userDataDir.
    """
    sess = payload.get("session") if isinstance(payload.get("session"), dict) else {}
    command = str((sess or {}).get("command") or "call").lower()

    if command in ("start", "open"):
        state = _ensure_session_server(ctx, payload=payload)
        return {"ok": True, "session": state}
    if command in ("close", "stop", "shutdown"):
        state = _load_session_state(_session_state_path(ctx)) or {}
        if not state:
            return {"ok": True, "session": None, "closed": False}
        return _close_session_server(ctx, state=state)
    if command in ("status", "health"):
        state = _load_session_state(_session_state_path(ctx)) or {}
        if not state or not state.get("baseUrl"):
            return {"ok": True, "running": False, "session": None}
        base_url = str(state["baseUrl"])
        return {"ok": True, "running": _is_session_healthy(base_url), "session": state}

    # Default: call action method on the session server.
    state = _ensure_session_server(ctx, payload=payload)
    base_url = str(state.get("baseUrl") or "").rstrip("/")
    if not base_url:
        raise RuntimeError("rpaskill_ts session server missing baseUrl")

    # Optional: after the action, persist the browser storage state to a stable path.
    # This is useful even in session mode (where the browser stays open), for backup/export.
    save_storage_target = payload.get("saveStorageStatePath")
    if save_storage_target:
        try:
            p = Path(str(save_storage_target))
            if not p.is_absolute():
                # Default relative paths to the agent outputs directory.
                p = (ctx.outputs_dir / p).resolve()
            p.parent.mkdir(parents=True, exist_ok=True)
            save_storage_target = str(p)
        except Exception:
            # Best-effort: keep the raw value; the Node side may still handle it.
            save_storage_target = str(save_storage_target)

    options = _action_options_from_payload(payload)
    ctx.events.emit("rpaskill_ts.session.call", data={"method": action, "baseUrl": base_url, "options": options}, scope="agent")

    # Some RPA flows (adaptive search, complex pages) can take a while; keep this generous.
    res = _json_http("POST", f"{base_url}/call", payload={"method": action, "params": options}, timeout_s=300.0)
    if not res.get("ok"):
        raise RuntimeError(f"rpaskill_ts session call failed: {res.get('error')}")

    result = {"ok": True, "action": action, "response": res.get("result"), "session": state}

    # Persist storageState snapshot after a successful call (best-effort).
    if save_storage_target:
        try:
            ss = _json_http(
                "POST",
                f"{base_url}/call",
                payload={"method": "saveStorageState", "params": [str(save_storage_target)]},
                timeout_s=60.0,
            )
            if ss.get("ok"):
                result["savedStorageStatePath"] = str(save_storage_target)
                ctx.artifacts.record_path(Path(str(save_storage_target)), scope="agent", kind="storage_state")
        except Exception:
            pass
    out_path = ctx.outputs_dir / f"rpaskill_ts_session_{action}_output.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ctx.artifacts.record_path(out_path, scope="agent", kind=f"rpaskill_ts.session.{action}.output")

    # Index common "*Path" outputs (screenshots/html/a11y/etc) for AI discoverability.
    try:
        response_obj = result.get("response") or {}
        if isinstance(response_obj, dict):
            for k, v in response_obj.items():
                if not isinstance(v, (str, Path)):
                    continue
                if k != "path" and not str(k).endswith("Path"):
                    continue
                p = Path(str(v))
                if not p.is_absolute():
                    p = (ctx.outputs_dir / p).resolve()

                kind = None
                kl = str(k).lower()
                if "screenshot" in kl:
                    kind = "screenshot"
                elif "html" in kl or "pagesource" in kl:
                    kind = "html"
                elif "a11y" in kl or "accessibility" in kl:
                    kind = "a11y"
                elif "elements" in kl or "uimap" in kl:
                    kind = "ui_map"

                ctx.artifacts.record_path(p, scope="agent", kind=kind, data={"field": k, "action": action})
    except Exception:
        pass

    # Optional: replay Node-side trace JSONL into events + index any referenced files.
    trace_path = payload.get("tracePath")
    if trace_path:
        tp = Path(str(trace_path))
        if not tp.is_absolute():
            tp = (ctx.outputs_dir / tp).resolve()
        if tp.exists():
            ctx.artifacts.record_path(tp, scope="agent", kind=f"rpaskill_ts.session.{action}.trace")
            for rec in _iter_jsonl(tp):
                ev = rec.get("event") or "trace"
                try:
                    ctx.events.emit(f"rpa.{ev}", data=rec, scope="agent")
                except Exception:
                    pass
                for k, v in rec.items():
                    if not isinstance(v, (str, Path)):
                        continue
                    if k != "path" and not k.endswith("Path"):
                        continue
                    if not v:
                        continue
                    p = Path(str(v))
                    if not p.is_absolute():
                        p = (ctx.outputs_dir / p).resolve()

                    kind = None
                    kl = k.lower()
                    if "screenshot" in kl:
                        kind = "screenshot"
                    elif kl in ("htmlpath", "pagesourcepath"):
                        kind = "html"
                    elif "a11y" in kl or "accessibility" in kl:
                        kind = "a11y"
                    elif "elements" in kl or "uimap" in kl:
                        kind = "ui_map"

                    ctx.artifacts.record_path(
                        p,
                        scope="agent",
                        kind=kind,
                        data={"url": rec.get("url"), "kind": rec.get("kind"), "event": ev, "field": k},
                    )

    return result
