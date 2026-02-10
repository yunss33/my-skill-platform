from __future__ import annotations

from typing import Any


def run(ctx) -> dict[str, Any]:
    """
    Variant A (shared profile):
    - Uses a fixed Playwright persistent profile directory under runtime/deps/
    - Intended for long-lived login reuse across many runs/days

    Implementation: delegate to the base rpa_ts_skill after injecting defaults.
    """
    # Import lazily to keep import side-effects minimal.
    from skills.rpa_ts_skill.main import run as base_run

    cfg = dict(ctx.config or {})

    # Default to session mode so the browser can stay open across multiple invocations.
    if "session" not in cfg:
        cfg["session"] = {"enabled": True, "command": "call", "userDataScope": "shared"}

    # Fixed user profile dir (persistent across runs).
    cfg.setdefault("userDataDir", str((ctx.platform.deps_dir / "pw_profiles" / "rpa_ts_shared").resolve()))

    # A "human-in-the-loop" RPA default should be visible unless explicitly overridden.
    cfg.setdefault("headless", False)

    old = ctx.config
    try:
        ctx.config = cfg
        return base_run(ctx)
    finally:
        ctx.config = old

