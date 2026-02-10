from __future__ import annotations

from typing import Any


def run(ctx) -> dict[str, Any]:
    """
    Variant B (run profile):
    - Uses a per-run persistent profile directory under outputs/<skill>/<run_id>/shared/
    - Intended for highly traceable/isolated runs (good for experiments and replay)

    Implementation: delegate to the base rpa_ts_skill after injecting defaults.
    """
    from skills.rpa_ts_skill.main import run as base_run

    cfg = dict(ctx.config or {})

    # Default to session mode so the browser can stay open across multiple invocations.
    # In session mode, when userDataDir is not set, the runtime will default to:
    #   outputs/<skill>/<run_id>/shared/pw_user_data
    if "session" not in cfg:
        cfg["session"] = {"enabled": True, "command": "call", "userDataScope": "shared"}

    # Ensure we don't accidentally inherit a fixed profile from copied configs.
    # Users can still explicitly pass --set userDataDir=... to override.
    cfg.pop("userDataDir", None)

    cfg.setdefault("headless", False)

    old = ctx.config
    try:
        ctx.config = cfg
        return base_run(ctx)
    finally:
        ctx.config = old

