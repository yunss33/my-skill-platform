from __future__ import annotations

import argparse
from pathlib import Path


def _parse_frontmatter(text: str) -> dict:
    """
    Very small YAML frontmatter parser:
    - expects `---` on first line
    - reads until next `---`
    Uses PyYAML if available, otherwise falls back to key: value lines.
    """
    lines = text.splitlines()
    if not lines:
        return {}
    # Tolerate UTF-8 BOM that some Windows editors add.
    first = lines[0].lstrip("\ufeff").strip()
    if first != "---":
        return {}
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}
    body = "\n".join(lines[1:end]).strip()
    if not body:
        return {}
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(body)
        return data or {}
    except Exception:
        out = {}
        for ln in body.splitlines():
            if ":" not in ln:
                continue
            k, v = ln.split(":", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
        return out


def main() -> int:
    p = argparse.ArgumentParser(description="Validate codex-skills folder structure.")
    p.add_argument("--root", default=".", help="Project root (default: .)")
    args = p.parse_args()

    root = Path(args.root).resolve()
    codex = root / "codex-skills"
    if not codex.exists():
        print(f"missing: {codex}")
        return 2

    ok = True
    for skill_dir in sorted([p for p in codex.iterdir() if p.is_dir()]):
        skill_md = skill_dir / "SKILL.md"
        agents_yaml = skill_dir / "agents" / "openai.yaml"
        if not skill_md.exists():
            print(f"[FAIL] missing SKILL.md: {skill_md}")
            ok = False
            continue
        if not agents_yaml.exists():
            print(f"[WARN] missing agents/openai.yaml: {agents_yaml}")

        fm = _parse_frontmatter(skill_md.read_text(encoding="utf-8", errors="replace"))
        if "name" not in fm or "description" not in fm:
            print(f"[FAIL] bad frontmatter (need name/description): {skill_md}")
            ok = False
        else:
            print(f"[OK] {fm['name']}: {skill_dir.name}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
