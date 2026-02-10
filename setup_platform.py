from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None, env=env)


def _venv_python(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def ensure_venv(venv_dir: Path) -> Path:
    py = _venv_python(venv_dir)
    if py.exists():
        return py
    venv_dir.parent.mkdir(parents=True, exist_ok=True)
    _run([sys.executable, "-m", "venv", str(venv_dir)])
    return _venv_python(venv_dir)


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parent
    runtime_dir = root / "runtime"
    deps_dir = runtime_dir / "deps"
    venv_dir = deps_dir / "python" / "venv"
    browsers_dir = deps_dir / "playwright_browsers"
    req = root / "requirements.txt"

    parser = argparse.ArgumentParser(description="Setup my-skill-platform runtime dependencies.")
    parser.add_argument(
        "--browsers",
        default="chromium",
        help="Comma-separated browsers to install via Playwright (default: chromium). Use 'all' for all.",
    )
    parser.add_argument(
        "--with-node",
        action="store_true",
        help="Also run npm install for integrations/rpaskill_ts (does not download browsers twice).",
    )
    parser.add_argument(
        "--download-host",
        default=None,
        help="Optional Playwright download host mirror (sets PLAYWRIGHT_DOWNLOAD_HOST).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help="Retries for Playwright browser downloads (default: 3).",
    )
    parser.add_argument(
        "--skip-browsers",
        action="store_true",
        help="Skip playwright browser downloads (use system browser channels like msedge/chrome instead).",
    )
    parser.add_argument(
        "--allow-browsers-fail",
        action="store_true",
        help="Do not fail the setup if browser downloads fail.",
    )
    args = parser.parse_args(argv)

    py = ensure_venv(venv_dir)

    _run([str(py), "-m", "pip", "install", "-U", "pip", "setuptools", "wheel"])
    if req.exists():
        _run([str(py), "-m", "pip", "install", "-r", str(req)])

    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers_dir)
    if args.download_host:
        env["PLAYWRIGHT_DOWNLOAD_HOST"] = str(args.download_host)
    # Some environments benefit from longer timeouts.
    env.setdefault("PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT", "60000")
    browsers_dir.mkdir(parents=True, exist_ok=True)

    browsers = [b.strip() for b in str(args.browsers).split(",") if b.strip()]
    if not browsers:
        browsers = ["chromium"]

    if not args.skip_browsers:
        install_cmd = [str(py), "-m", "playwright", "install"]
        if not (len(browsers) == 1 and browsers[0].lower() == "all"):
            install_cmd += browsers

        for attempt in range(1, max(1, int(args.retries)) + 1):
            try:
                _run(install_cmd, env=env)
                break
            except Exception as e:
                print(f"Playwright install failed (attempt {attempt}/{args.retries}): {e}")
                if attempt >= args.retries:
                    if args.allow_browsers_fail:
                        print("WARNING: playwright browser download failed; continuing anyway.")
                    else:
                        raise

    if args.with_node:
        node = shutil.which("node")
        npm = shutil.which("npm")
        if not node or not npm:
            raise RuntimeError("Node/npm not found in PATH; cannot setup rpaskill_ts integration.")
        integration_root = root / "integrations" / "rpaskill_ts"
        if not (integration_root / "package.json").exists():
            raise FileNotFoundError(f"Missing integration: {integration_root}")
        _run([npm, "ci"], cwd=integration_root)
        # Ensure Node uses the same shared browsers location.
        _run([npm, "run", "pw:install"], cwd=integration_root, env=env)

    print("OK")
    print("Python venv:", venv_dir)
    print("Playwright browsers:", browsers_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
