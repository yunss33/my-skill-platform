from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional

from .utils import ensure_dir, get_project_root, try_load_yaml


@dataclass(frozen=True)
class PlatformConfig:
    root_dir: Path
    skills_dir: Path
    outputs_dir: Path
    logs_dir: Path
    deps_dir: Path
    playwright_browsers_dir: Path
    log_level: str = "INFO"


def load_platform_config(
    *,
    root_dir: Optional[Path] = None,
    environ: Mapping[str, str] = os.environ,
) -> PlatformConfig:
    """
    Centralized config loader with env-var overrides.

    Keep this stable; extend by adding new fields with sensible defaults.
    """
    if root_dir is None:
        root_dir = get_project_root()
    else:
        root_dir = root_dir.resolve()

    skills_dir = Path(environ.get("SKILLBOX_SKILLS_DIR", str(root_dir / "skills")))
    outputs_dir = Path(environ.get("SKILLBOX_OUTPUTS_DIR", str(root_dir / "outputs")))
    logs_dir = Path(environ.get("SKILLBOX_LOGS_DIR", str(root_dir / "logs")))
    deps_dir = Path(environ.get("SKILLBOX_DEPS_DIR", str(root_dir / "runtime" / "deps")))
    playwright_browsers_dir = Path(
        environ.get("PLAYWRIGHT_BROWSERS_PATH", str(deps_dir / "playwright_browsers"))
    )
    log_level = environ.get("SKILLBOX_LOG_LEVEL", "INFO")

    # Create the common dirs early so the rest of the runtime can assume they exist.
    ensure_dir(outputs_dir)
    ensure_dir(logs_dir)
    ensure_dir(deps_dir)
    ensure_dir(playwright_browsers_dir)

    return PlatformConfig(
        root_dir=root_dir,
        skills_dir=skills_dir,
        outputs_dir=outputs_dir,
        logs_dir=logs_dir,
        deps_dir=deps_dir,
        playwright_browsers_dir=playwright_browsers_dir,
        log_level=log_level,
    )


def load_skill_config(skill_dir: Path) -> dict[str, Any]:
    """
    Load optional skill-local config.
    Default: skills/<skill>/config.yaml
    """
    return try_load_yaml(skill_dir / "config.yaml")
