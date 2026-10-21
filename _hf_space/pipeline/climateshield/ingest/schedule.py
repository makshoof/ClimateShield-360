"""Hourly scheduling. Default is a local loop; Windows Task Scheduler is optional."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from climateshield.config import INGEST_INTERVAL_SECONDS, ROOT


def run_hourly_loop(
    *,
    interval_seconds: int = INGEST_INTERVAL_SECONDS,
    once: bool = False,
    cycles: int | None = None,
    ingest_fn: Callable[[], Any] | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> list[Any]:
    """Run ingest immediately, then every interval_seconds.

    `cycles` is for tests. Production hourly mode uses cycles=None and once=False.
    """
    if ingest_fn is None:
        from climateshield.ingest.run import run_ingest

        ingest_fn = run_ingest
    outputs: list[Any] = []
    completed = 0
    while True:
        outputs.append(ingest_fn())
        completed += 1
        if once:
            break
        if cycles is not None and completed >= cycles:
            break
        sleep_fn(interval_seconds)
    return outputs


def windows_task_command(python_exe: str = "python") -> str:
    script = (
        f'"{python_exe}" -m climateshield ingest-hourly --once'
    )
    return (
        "schtasks /Create /F /TN ClimateShield360HourlyIngest "
        f"/SC HOURLY /MO 1 /TR {script!s}"
    )


def write_windows_task_script(path=None) -> str:
    from pathlib import Path

    target = Path(path) if path else ROOT / "scripts" / "register_hourly_ingest_task.ps1"
    target.parent.mkdir(parents=True, exist_ok=True)
    repo = str(ROOT).replace("'", "''")
    content = f"""# Register an hourly ClimateShield ingest task. Run in an elevated PowerShell if needed.
# This does not start a dashboard.
$repo = '{repo}'
$py = (Get-Command python).Source
$action = "$py -m climateshield ingest-hourly --once"
Set-Location $repo
schtasks /Create /F /TN ClimateShield360HourlyIngest /SC HOURLY /MO 1 /TR $action
Write-Output "Registered ClimateShield360HourlyIngest to run hourly in $repo"
Write-Output "Manual run: python -m climateshield ingest-hourly --once"
Write-Output "Foreground loop: python -m climateshield ingest-hourly --schedule"
"""
    target.write_text(content, encoding="utf-8")
    return str(target)
