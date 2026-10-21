"""Audit log for every fix / fill / flag / remove / keep decision."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from climateshield.io_utils import write_csv

Action = Literal["fix", "fill", "flag", "remove", "keep"]


@dataclass
class QualityDecision:
    timestamp_utc: str
    dataset: str
    rule_id: str
    action: Action
    column: str
    n_rows: int
    reason: str
    details: str = ""
    extras: dict[str, Any] = field(default_factory=dict)


class QualityLogger:
    def __init__(self) -> None:
        self.decisions: list[QualityDecision] = []

    def record(
        self,
        dataset: str,
        rule_id: str,
        action: Action,
        reason: str,
        n_rows: int = 0,
        column: str = "",
        details: str = "",
        **extras: Any,
    ) -> QualityDecision:
        decision = QualityDecision(
            timestamp_utc=datetime.now(timezone.utc).isoformat(),
            dataset=dataset,
            rule_id=rule_id,
            action=action,
            column=column,
            n_rows=int(n_rows),
            reason=reason,
            details=details,
            extras=extras,
        )
        self.decisions.append(decision)
        return decision

    def to_frame(self) -> pd.DataFrame:
        rows = []
        for item in self.decisions:
            payload = asdict(item)
            extras = payload.pop("extras") or {}
            payload["details"] = payload["details"] or json_safe(extras)
            rows.append(payload)
        if not rows:
            return pd.DataFrame(
                columns=[
                    "timestamp_utc",
                    "dataset",
                    "rule_id",
                    "action",
                    "column",
                    "n_rows",
                    "reason",
                    "details",
                ]
            )
        return pd.DataFrame(rows)

    def write_csv(self, path: Path) -> None:
        write_csv(path, self.to_frame())

    def counts_by_action(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in self.decisions:
            counts[item.action] = counts.get(item.action, 0) + 1
        return counts


def json_safe(value: Any) -> str:
    if not value:
        return ""
    try:
        import json

        return json.dumps(value, default=str)
    except TypeError:
        return str(value)
