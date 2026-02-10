# Repo Architecture (Brain Map)

This repo is organized like a "brain" with clear partitions. When adding new features, put them in the partition that matches the responsibility.

## Partitions

### 1) Motor (RPA framework)
Playwright browser control and UI actions (navigation, clicks, typing, waits).

- Code: `src/core/`
- Public API: `src/index.ts`

### 2) Perception (Extraction)
Read the page and extract structured data (text, attributes, tables, HTML).

- Code: `src/core/extractor.ts`

### 3) Executive (Flow control)
Retries, timeouts, sequencing/parallelism, and orchestration helpers.

- Code: `src/core/flow.ts`

### 4) Cognition (Search & Query enhancement)
Search workflows (webSearch/adaptiveSearch), query expansion, and decision logging.

- Code: `src/skills/`
- CLI: `examples/run-adaptive-search.js`
- Config: `configs/search.json`
- Logs: `artifacts/search-log-*.json` / `artifacts/search-log-*.jsonl`

### 5) Memory (Config + logs)
Config, logger, and persisted audit logs.

- Code: `src/utils/`
- Logs: `artifacts/`

### 6) Codex Skills (Repo-local)
These are *Codex skill definitions* (not runtime TypeScript "skills").

- Folder: `codex-skills/`
  - `codex-skills/rpa-web-automation/`
  - `codex-skills/search-enhancer/`

## Naming rule (to reduce confusion)

- Use `codex-skills/` only for Codex skill definitions (`SKILL.md`, `agents/openai.yaml`).
- Use `src/skills/` only for runtime search modules used by `RPASkill` (TypeScript).
