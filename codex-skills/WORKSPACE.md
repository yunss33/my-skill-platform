# Multi-AI Workspace Protocol (Codex Skills)

This file defines lightweight collaboration rules for multiple AIs working in this repo.

## Goals

- Avoid conflicting writes when multiple agents work concurrently
- Keep work traceable (who did what, what changed, where the evidence is)
- Keep outputs queryable by another AI later

## Progressive Approach

1) Plan first (Level 0): clarify + decide where code should live
2) Implement minimal change (Level 1): smallest patch that works
3) Harden (Level 2): refactor + tests + docs + logs

## Write Rules (No Locks)

Until file locking is implemented:

- Prefer agent-private workspaces (never overwrite others' files)
- Shared writes should be done by a single coordinator agent

If you need shared writes, use append-only formats (`*.jsonl`) and keep entries small.

## Run Layout (Platform Skills)

Per `(skill, run_id)`:

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

Recommended:
- Each agent writes to `agents/<agent_id>/...`
- The coordinator optionally writes summaries to `shared/`

## Query-Friendly Logging

Prefer JSONL:
- `events.jsonl`: chronological structured events (filterable)
- `memory.jsonl`: decisions/facts (small, reference artifact paths)
- `index.jsonl`: artifact registry (paths + hashes)

Do not store huge text blobs in memory/events; store them as artifacts and reference the path.

