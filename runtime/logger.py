from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from .utils import ensure_dir


def create_logger(
    name: str,
    *,
    log_dir: Path,
    run_id: str,
    file_name: str | None = None,
    level: str = "INFO",
    console: bool = True,
) -> logging.Logger:
    """
    Create a per-run logger that logs to console + file.

    We keep it simple and stable: one file per run_id so parallel runs don't collide.
    """
    logger = logging.getLogger(name)
    logger.setLevel(level.upper())

    # Avoid duplicate handlers if called multiple times in the same process.
    if getattr(logger, "_skillbox_configured", False):
        return logger

    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s [%(name)s] [run=%(run_id)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ensure_dir(log_dir)
    if file_name is None:
        file_name = f"{run_id}.log"
    file_path = log_dir / file_name

    class _RunIdFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:  # type: ignore[override]
            record.run_id = run_id
            return True

    run_filter = _RunIdFilter()

    file_handler = logging.FileHandler(file_path, encoding="utf-8")
    file_handler.setLevel(level.upper())
    file_handler.setFormatter(fmt)
    file_handler.addFilter(run_filter)
    logger.addHandler(file_handler)

    if console:
        stream_handler = logging.StreamHandler()
        stream_handler.setLevel(level.upper())
        stream_handler.setFormatter(fmt)
        stream_handler.addFilter(run_filter)
        logger.addHandler(stream_handler)

    logger.propagate = False
    setattr(logger, "_skillbox_configured", True)
    return logger
