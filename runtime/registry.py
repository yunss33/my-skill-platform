from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

from .utils import add_sys_path


@dataclass(frozen=True)
class SkillManifest:
    name: str
    version: str
    description: str
    entry: str  # e.g. "main:run"
    skill_dir: Path
    project_root: Path
    capabilities: dict[str, Any]


def _iter_skill_roots(project_root: Path, *, environ: dict[str, str] = os.environ) -> list[Path]:
    """
    Skill roots are "project-like" roots that contain a `skills/` folder.

    - Always include current project_root
    - Optionally include extra roots from SKILLBOX_SKILL_PATHS (os.pathsep-separated)
    """
    roots = [project_root.resolve()]
    extra = environ.get("SKILLBOX_SKILL_PATHS", "").strip()
    if extra:
        for item in extra.split(os.pathsep):
            item = item.strip().strip('"')
            if not item:
                continue
            p = Path(item).expanduser().resolve()
            if p not in roots:
                roots.append(p)
    return roots


def _load_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def discover_skills(project_root: Path, *, environ: dict[str, str] = os.environ) -> list[SkillManifest]:
    """
    Discover skills across skill roots.

    A discoverable skill is a folder under `<root>/skills/<skill_name>/` with `skill.json`.
    """
    manifests: list[SkillManifest] = []
    seen: set[str] = set()
    for root in _iter_skill_roots(project_root, environ=environ):
        skills_dir = root / "skills"
        if not skills_dir.exists():
            continue
        for d in sorted([p for p in skills_dir.iterdir() if p.is_dir()]):
            mf = d / "skill.json"
            if not mf.exists():
                continue
            try:
                data = _load_manifest(mf)
                name = str(data.get("name") or d.name)
                if name in seen:
                    # First match wins; keep deterministic ordering.
                    continue
                manifests.append(
                    SkillManifest(
                        name=name,
                        version=str(data.get("version") or "0.0.0"),
                        description=str(data.get("description") or ""),
                        entry=str(data.get("entry") or "main:run"),
                        skill_dir=d,
                        project_root=root,
                        capabilities=dict(data.get("capabilities") or {}),
                    )
                )
                seen.add(name)
            except Exception:
                # Ignore broken manifests during discovery; validation will surface it.
                continue
    return manifests


def resolve_skill(skill_name: str, project_root: Path, *, environ: dict[str, str] = os.environ) -> SkillManifest:
    for mf in discover_skills(project_root, environ=environ):
        if mf.name == skill_name:
            return mf
    raise FileNotFoundError(f"Skill manifest not found for skill={skill_name!r} under skill roots")


def validate_skill(skill_name: str, project_root: Path, *, environ: dict[str, str] = os.environ) -> None:
    """
    Validate that a skill can be imported and has the declared entrypoint.
    """
    mf = resolve_skill(skill_name, project_root, environ=environ)
    if ":" not in mf.entry:
        raise ValueError(f"Invalid entry format (expected module:function): {mf.entry}")
    mod_rel, fn = mf.entry.split(":", 1)
    mod_rel = mod_rel.strip()
    fn = fn.strip()
    if not mod_rel or not fn:
        raise ValueError(f"Invalid entry format (expected module:function): {mf.entry}")

    # Ensure the owning project root is importable so `skills.<name>.<module>` works.
    add_sys_path(mf.project_root)

    module_name = f"skills.{mf.name}.{mod_rel}"
    mod = __import__(module_name, fromlist=[fn])
    if not hasattr(mod, fn):
        raise AttributeError(f"Missing entry function {fn!r} in {module_name}")
    if not callable(getattr(mod, fn)):
        raise TypeError(f"Entry {module_name}:{fn} is not callable")

