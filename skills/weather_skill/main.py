from __future__ import annotations

from typing import Any


def run(ctx) -> dict[str, Any]:
    """
    Minimal example skill.
    Replace with real logic later; keep the `run(ctx)` interface stable.
    """
    ctx.logger.info("weather_skill running (agent=%s run=%s)", ctx.agent_id, ctx.run_id)
    ctx.events.emit("weather.tick", message="example event", data={"note": "hello"}, scope="agent")
    ctx.memory.append({"type": "note", "text": "weather_skill ran"}, scope="agent")
    ctx.artifacts.write_json("example.json", {"hello": "world"}, scope="agent")
    return {
        "status": "ok",
        "message": "weather_skill stub (replace me)",
        "config": ctx.config,
        "outputs_dir": str(ctx.outputs_dir),
    }
