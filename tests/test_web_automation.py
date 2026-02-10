from __future__ import annotations

import importlib
import unittest
from pathlib import Path

from runtime.engine import run_skill
from runtime.registry import discover_skills, validate_skill


class TestEngineSmoke(unittest.TestCase):
    def test_run_weather_skill(self) -> None:
        # Use explicit root so the test is stable even if invoked from elsewhere.
        root_dir = Path(__file__).resolve().parents[1]
        res = run_skill("weather_skill", root_dir=root_dir, agent_id="agent_test")
        self.assertEqual(res["status"], "ok")

    def test_run_web_search_skill_imports(self) -> None:
        # Smoke test: import only (do not execute; execution requires browsers/network).
        mod = importlib.import_module("skills.web_search_skill.main")
        self.assertTrue(hasattr(mod, "run"))

    def test_codex_skills_have_frontmatter(self) -> None:
        # Repo hygiene test: codex-skills are instruction packs for multi-agent collaboration.
        root_dir = Path(__file__).resolve().parents[1]
        codex = root_dir / "codex-skills"
        self.assertTrue(codex.exists())
        # At least rpa-web-automation should exist in this repo.
        self.assertTrue((codex / "rpa-web-automation" / "SKILL.md").exists())

    def test_config_overrides_merge(self) -> None:
        root_dir = Path(__file__).resolve().parents[1]
        res = run_skill(
            "weather_skill",
            root_dir=root_dir,
            agent_id="agent_test3",
            run_id="override_demo",
            config_overrides={"query": "hello", "n": 2},
            invocation={"test": True},
        )
        self.assertEqual(res["status"], "ok")

    def test_skill_discovery_and_validation(self) -> None:
        root_dir = Path(__file__).resolve().parents[1]
        skills = discover_skills(root_dir)
        names = {s.name for s in skills}
        self.assertIn("weather_skill", names)
        validate_skill("weather_skill", root_dir)


if __name__ == "__main__":
    unittest.main()
