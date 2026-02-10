from __future__ import annotations

import os
import traceback
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from .config import PlatformConfig, load_platform_config, load_skill_config
from .common import (
    ArtifactMeta,
    ArtifactStore,
    EventBus,
    EventLog,
    EventMeta,
    MemoryLog,
    MemoryMeta,
    MemoryStore,
    RunMeta,
    write_agent_meta,
    write_shared_run_meta,
)
from .logger import create_logger
from .registry import resolve_skill
from .utils import add_sys_path, ensure_dir, utc_now_compact, write_json


@dataclass
class SkillContext:
    skill_name: str
    run_id: str
    agent_id: str
    config: dict[str, Any]
    platform: PlatformConfig
    skill_dir: Path
    resources_dir: Path
    shared_resources_dir: Path
    private_resources_dir: Path
    run_dir: Path
    shared_dir: Path
    agent_dir: Path
    work_dir: Path
    outputs_dir: Path
    logger: Any  # logging.Logger
    events: EventBus
    memory: MemoryStore
    artifacts: ArtifactStore
    is_coordinator: bool


def _make_run_id() -> str:
    return f"{utc_now_compact()}_{uuid.uuid4().hex[:8]}"


def run_skill(
    skill_name: str,
    *,
    root_dir: Optional[Path] = None,
    run_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    config_overrides: Optional[dict[str, Any]] = None,
    invocation: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Run a skill by importing skills.<skill_name>.main and calling run(ctx).

    This import style enables per-skill "common code" via relative imports, e.g.
    `from .common.login import login`.
    """
    platform_cfg = load_platform_config(root_dir=root_dir)
    mf = resolve_skill(skill_name, platform_cfg.root_dir)
    skill_dir = mf.skill_dir

    # Make project root (and the skill's owning root) importable so `import skills.xxx.main` works from any CWD.
    add_sys_path(platform_cfg.root_dir)
    add_sys_path(mf.project_root)

    if run_id is None:
        run_id = os.environ.get("SKILLBOX_RUN_ID") or _make_run_id()
    if agent_id is None:
        agent_id = os.environ.get("SKILLBOX_AGENT_ID") or "agent0"
    is_coordinator = os.environ.get("SKILLBOX_COORDINATOR") == "1" or agent_id == "agent0"

    # Standard run layout:
    # outputs/<skill>/<run_id>/
    #   shared/...
    #   agents/<agent_id>/work/...
    run_dir = ensure_dir(platform_cfg.outputs_dir / skill_name / run_id)
    shared_dir = ensure_dir(run_dir / "shared")
    agent_dir = ensure_dir(run_dir / "agents" / agent_id)
    work_dir = ensure_dir(agent_dir / "work")

    # Skills should write outputs into an agent-private directory by default.
    outputs_dir = agent_dir
    resources_dir = skill_dir / "resources"
    shared_resources_dir = resources_dir / "shared"
    private_resources_dir = resources_dir / "private"

    # Pin Playwright browsers path for all skills, so everyone shares the same binaries.
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(platform_cfg.playwright_browsers_dir)
    os.environ["SKILLBOX_RUN_ID"] = run_id
    os.environ["SKILLBOX_AGENT_ID"] = agent_id

    logger = create_logger(
        f"skill.{skill_name}.{run_id}",
        log_dir=platform_cfg.logs_dir / skill_name / run_id,
        run_id=run_id,
        file_name=f"{agent_id}.log",
        level=platform_cfg.log_level,
    )

    # JSONL logs for AI querying:
    # - agent events/memory are safe without locks
    # - shared events/memory should ideally be written by a single coordinator agent
    meta = EventMeta(skill=skill_name, run_id=run_id, agent_id=agent_id)
    agent_events = EventLog(agent_dir / "events.jsonl", meta=meta)
    shared_events = EventLog(shared_dir / "events.jsonl", meta=meta)
    events = EventBus(agent_log=agent_events, shared_log=shared_events)

    mm = MemoryMeta(skill=skill_name, run_id=run_id, agent_id=agent_id)
    agent_memory = MemoryLog(agent_dir / "memory.jsonl", meta=mm)
    shared_memory = MemoryLog(shared_dir / "memory.jsonl", meta=mm)
    memory = MemoryStore(agent_log=agent_memory, shared_log=shared_memory)

    artifacts = ArtifactStore(
        agent_dir=agent_dir,
        shared_dir=shared_dir,
        meta=ArtifactMeta(skill=skill_name, run_id=run_id, agent_id=agent_id),
    )

    skill_cfg = load_skill_config(skill_dir)
    merged_cfg: dict[str, Any] = dict(skill_cfg)
    if config_overrides:
        # Shallow merge is the default; keep it predictable and stable.
        merged_cfg.update(config_overrides)

    # Write run metadata files to make later searching/iteration easier.
    # - agent.json: always written (agent-private)
    # - run.json: only written by coordinator agent (shared)
    started_at = utc_now_compact()
    meta = RunMeta(
        skill=skill_name,
        run_id=run_id,
        root_dir=str(platform_cfg.root_dir),
        agent_id=agent_id,
        started_at=started_at,
        coordinator=is_coordinator,
    )
    write_agent_meta(agent_dir, meta, config=merged_cfg)
    if is_coordinator:
        write_shared_run_meta(shared_dir, meta)

    ctx = SkillContext(
        skill_name=skill_name,
        run_id=run_id,
        agent_id=agent_id,
        config=merged_cfg,
        platform=platform_cfg,
        skill_dir=skill_dir,
        resources_dir=resources_dir,
        shared_resources_dir=shared_resources_dir,
        private_resources_dir=private_resources_dir,
        run_dir=run_dir,
        shared_dir=shared_dir,
        agent_dir=agent_dir,
        work_dir=work_dir,
        outputs_dir=outputs_dir,
        logger=logger,
        events=events,
        memory=memory,
        artifacts=artifacts,
        is_coordinator=is_coordinator,
    )

    result_path = agent_dir / "result.json"

    try:
        # Persist the exact request that triggered this run for traceability.
        ctx.artifacts.write_json(
            "work/request.json",
            {
                "skill": skill_name,
                "run_id": run_id,
                "agent_id": agent_id,
                "config": merged_cfg,
                "config_overrides": config_overrides or {},
                "invocation": invocation or {},
            },
            scope="agent",
        )

        ctx.events.emit("skill.start", message="skill started", scope="agent")
        ctx.memory.append({"type": "skill.start", "message": "skill started"}, scope="agent")

        module_name = f"skills.{skill_name}.main"
        mod = __import__(module_name, fromlist=["run"])
        if not hasattr(mod, "run"):
            raise AttributeError(f"{module_name} must define run(ctx)")
        res = mod.run(ctx)  # type: ignore[attr-defined]
        if res is None:
            res = {"status": "ok"}
        if not isinstance(res, dict):
            res = {"status": "ok", "result": res}
        res.setdefault("run_id", run_id)
        res.setdefault("skill", skill_name)
        res.setdefault("agent_id", agent_id)
        res.setdefault("outputs_dir", str(outputs_dir))
        write_json(result_path, res)
        ctx.events.emit("skill.end", message="skill finished", scope="agent", data={"status": res.get("status")})
        return res
    except Exception as e:
        err = {
            "status": "error",
            "skill": skill_name,
            "run_id": run_id,
            "agent_id": agent_id,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
        try:
            write_json(result_path, err)
        except Exception:
            # Last resort: do not mask the original error.
            pass
        logger.error("Skill failed: %s", e)
        try:
            ctx.events.emit("skill.error", message=str(e), level="ERROR", scope="agent")
        except Exception:
            pass
        raise
