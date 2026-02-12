# Skill Contract (my-skill-platform)

This document defines the stable interface and folder conventions for skills in this repository.

## What Is A Skill

A skill is a Python package under `skills/<skill_name>/` that exposes:

- `main.py` with `run(ctx)` (required)
- optional `config.yaml` (skill defaults)
- optional `resources/` (static files bundled with the skill)
- optional `common/` (skill-private shared code)

The platform/runtime loads a skill as a module: `skills.<skill_name>.main`.
This allows skill-local relative imports, e.g. `from .common.login import login`.

## Skill Interface

`skills/<skill_name>/main.py` must define:

```python
def run(ctx) -> dict | object | None:
    ...
```

- Return value:
  - `dict`: returned as-is (engine will add `skill/run_id/agent_id/outputs_dir` if missing)
  - `None`: treated as `{"status": "ok"}`
  - any other type: wrapped as `{"status": "ok", "result": <value>}`

## Context (ctx)

The runtime provides `ctx` (see `runtime/engine.py`). Common fields:

- Identity: `ctx.skill_name`, `ctx.run_id`, `ctx.agent_id`
- Paths:
  - `ctx.skill_dir`
  - `ctx.resources_dir`
  - `ctx.shared_resources_dir` (convention: `resources/shared/`)
  - `ctx.private_resources_dir` (convention: `resources/private/`)
  - `ctx.run_dir` (outputs root for this run)
  - `ctx.shared_dir` (shared run workspace)
  - `ctx.agent_dir` (agent-private run workspace)
  - `ctx.work_dir` (agent-private scratch space)
  - `ctx.outputs_dir` (defaults to `ctx.agent_dir`)
- Logging and records:
  - `ctx.logger` (text log)
  - `ctx.events.emit(...)` (JSONL events)
  - `ctx.memory.append(...)` (JSONL memory)
  - `ctx.artifacts.write_*` (write artifact + index.jsonl)

## Resource Conventions

Static resources (checked into git):

- Shared resource files: `skills/<skill>/resources/shared/`
- Private resource files: `skills/<skill>/resources/private/` (avoid secrets; prefer env vars)

Rule of thumb: **do not write into `skills/**` at runtime**. Write into `outputs/**`.

## Output Layout (Per Run)

For a run `(skill_name, run_id)`:

```
outputs/<skill>/<run_id>/
  shared/
  agents/<agent_id>/
    work/
    events.jsonl
    memory.jsonl
    index.jsonl
    result.json
```

Without locking, prefer writing to `agents/<agent_id>/` (agent-private) and reserve `shared/`
for a single coordinator agent.

## Logging For AI Query

Use structured logs:

- events: `events.jsonl` (filter by `event`, `level`, `run_id`, `agent_id`)
- memory: `memory.jsonl` (small facts/decisions; store large content as artifacts and reference paths)
- artifacts index: `index.jsonl` (what was produced, where it is, hashes/sizes)

## Dependency Policy (Public Dependencies)

- Python deps live in the shared runtime venv: `runtime/deps/python/venv/`
- Playwright browsers path is pinned by the engine via `PLAYWRIGHT_BROWSERS_PATH`:
  `runtime/deps/playwright_browsers/`

Setup:

```powershell
python setup_platform.py --skip-browsers
# optionally try browser download later (may require stable network)
# python setup_platform.py --browsers chromium
```

## Add A New Skill (Checklist)

1) Create folder:
   - `skills/<new_skill>/__init__.py`
   - `skills/<new_skill>/main.py`
   - `skills/<new_skill>/skill.json` (required for discovery/list/validation)
   - optional: `config.yaml`, `common/`, `resources/`
2) Implement `run(ctx)` and keep all runtime writes under `ctx.outputs_dir` / `ctx.work_dir`.
3) Run it:

```powershell
python run.py --skill <new_skill> --root .
```

## Skill Discovery (Manifests)

Skills are discoverable when they provide `skills/<skill>/skill.json`.

List:

```powershell
python run.py --root . --list
```

Validate:

```powershell
python run.py --root . --validate --skill <skill>
```

## Run Without Editing config.yaml (CLI Overrides)

You can override skill config on the command line (repeatable):

```powershell
python run.py --skill web_search_skill --root . --run-id demo --agent agent0 `
  --set query="..." --set engine="bing" --set pages=2 --set details=0 --set channel="msedge"
```

For traceability, each run persists the merged config in:
- `outputs/<skill>/<run_id>/agents/<agent>/work/request.json`
- `outputs/<skill>/<run_id>/agents/<agent>/agent.json`

## Screenshots (Rendered Page Images)

For TS-based search skills (`web_search_skill`, `adaptive_search_skill`), you can save screenshots of:
- search result pages: `screenshotPrefix`
- opened detail pages (when `details > 0`): `openScreenshotPrefix`

Note: SERP titles/snippets can be incomplete or misleading. If you need better recall, set `details > 0`
to click into a few results and capture `openScreenshotPrefix` for later analysis/replay.

Example:

```powershell
python run.py --skill web_search_skill --root . --run-id demo --agent agent0 `
  --set query="..." --set engine="baidu" --set pages=2 --set details=2 `
  --set screenshotPrefix="D:\\path\\to\\outputs\\...\\screenshots\\search" `
  --set openScreenshotPrefix="D:\\path\\to\\outputs\\...\\screenshots\\open"
```

## RPA Trace + Image Indexing (For "AI Can See What Happened")

TS-based search skills also write an append-only trace log (JSONL) that includes the
page URL and the screenshot file path, so later agents can "replay" the browsing process:

- default: `outputs/<skill>/<run_id>/agents/<agent>/rpa_trace.jsonl`
- configurable: `--set tracePath="..."`

Screenshots and trace files are also indexed into `index.jsonl` (artifact index), so you can query them.

## TypeScript Integration (RPASkill)

The TS project is located at `integrations/rpaskill_ts/`.
The Python bridge skill is `skills/rpa_ts_skill/` and calls the Node runner:
`integrations/rpaskill_ts/cli/run.mjs`.

To make the original `RPASkill/src/skills/*` modules show up as first-class platform skills,
this repo also provides thin wrapper skills:

- `skills/web_search_skill/` -> TS `webSearch`
- `skills/adaptive_search_skill/` -> TS `adaptiveSearch`

### Inspect A Page (Screenshot + HTML + UI Map)

For RPA debugging / human-in-the-loop, `rpa_ts_skill` also supports `action=inspectPage`:

```powershell
python run.py --skill rpa_ts_skill --root . --run-id inspect_demo --agent agent0 `
  --set action=inspectPage --set url="https://www.baidu.com" --set channel="msedge" --set headless=true
```

Outputs (under `outputs/rpa_ts_skill/<run_id>/agents/<agent>/captures/`):
- `*_screenshot.png` (what a human sees)
- `*_page.html` (page code snapshot)
- `*_a11y.aria.yml` (ARIA snapshot)
- `*_elements.json` (UI map: visible/clickable elements with bounding boxes + selector hints)

### Human-In-The-Loop Pause (Let A Person Operate, Then Continue)

When you hit login/captcha and need a human to step in, use `pauseForHuman=true` (browser must be visible):

```powershell
python run.py --skill rpa_ts_skill --root . --run-id hil_demo --agent agent0 `
  --set action=inspectPage --set url="https://example.com/login" `
  --set pauseForHuman=true --set headless=false --set channel="msedge"
```

Flow:
- skill opens the page, captures "before" artifacts
- waits for the person to finish操作, then press **Enter** in the terminal
- captures "after" artifacts (so AI can diff before/after)

## Useful Tools (Local)

- List runs: `python tools/list_runs.py --root .`
- Query events: `python tools/query_events.py --root . --skill <skill> --run-id <run_id> --agent <agent>`
- Query artifacts (including screenshots): `python tools/query_artifacts.py --root . --skill <skill> --run-id <run_id> --agent <agent>`
- Validate Codex skill packs: `python tools/validate_codex_skills.py --root .`
