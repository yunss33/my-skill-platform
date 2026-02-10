from __future__ import annotations

from typing import Any


def run(ctx) -> dict[str, Any]:
    """
    Minimal placeholder for an RPA/web automation skill.
    Real Playwright usage should live here or in skill-local modules under this folder.
    """
    ctx.logger.info("web_automation_skill running (agent=%s run=%s)", ctx.agent_id, ctx.run_id)
    selectors_path = ctx.resources_dir / "selectors.json"
    return {
        "status": "ok",
        "message": "web_automation_skill stub (replace me)",
        "selectors_exists": selectors_path.exists(),
    }
