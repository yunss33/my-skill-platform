# Repo-local skills

This folder is an index of the skills shipped with this repo (each skill lives in its own subfolder).

- `codex-skills/rpa-web-automation/SKILL.md` - Playwright-based browser automation utilities
- `codex-skills/search-enhancer/SKILL.md` - Query enhancement + multi-round search (`adaptiveSearch`) + audit logs

## What These Are

These are **Codex multi-agent skills** (instruction packs) to help multiple AIs collaborate in this repo.
They are not the runtime skills under `skills/`.

## Progressive (Recommended)

Each Codex skill is written to support progressive execution:
- Level 0: clarify + plan
- Level 1: minimal change
- Level 2: execute + add structured logs + harden

If you are running platform skills, see `SKILL.md` (repo root) for the runtime contract and
`runtime/engine.py` for the run output layout (events/memory/artifacts).
