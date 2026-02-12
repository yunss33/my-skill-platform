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

    # Default: fixed user profile dir (persistent across runs).
    # If profileSite/profileAccount is provided, we *do not* set userDataDir here,
    # so rpa_ts_skill can apply its multi-login convention:
    #   runtime/deps/browser_profiles/<site>/<account>/
    if not cfg.get("userDataDir") and not (
        cfg.get("profileSite") or cfg.get("site") or cfg.get("profileAccount") or cfg.get("account") or cfg.get("profile")
    ):
        cfg.setdefault("userDataDir", str((ctx.platform.deps_dir / "pw_profiles" / "rpa_ts_shared").resolve()))

    # A "human-in-the-loop" RPA default should be visible unless explicitly overridden.
    cfg.setdefault("headless", False)

    old = ctx.config
    try:
        ctx.config = cfg
        return base_run(ctx)
    finally:
        ctx.config = old
