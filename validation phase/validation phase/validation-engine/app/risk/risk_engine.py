from typing import Any, Dict, List, Optional
from app.config.loader import get_risk_rules
from app.models.validation_result import (
    RiskSummary,
    Severity,
    ValidationResultItem,
)


class RiskEngine:
    def __init__(self, risk_rules: Optional[Dict[str, Any]] = None):
        self._rules = risk_rules

    @property
    def rules(self) -> Dict[str, Any]:
        if self._rules is None:
            self._rules = get_risk_rules()
        return self._rules

    def evaluate(self, results: List[ValidationResultItem]) -> RiskSummary:
        rules = self.rules
        max_score = rules.get("max_risk_score", 100)

        total_points = sum(r.risk_points for r in results)
        final_score = min(total_points, max_score)

        # Critical Override Check (e.g. exact duplicate or critical financial anomaly)
        has_critical = any(r.severity == Severity.CRITICAL for r in results)

        thresholds = rules.get("risk_thresholds", {})
        risk_level = "LOW"

        for level_key, t_info in thresholds.items():
            if isinstance(t_info, dict):
                min_s = t_info.get("min_score", 0)
                max_s = t_info.get("max_score", 100)
                if min_s <= final_score <= max_s:
                    risk_level = level_key.upper()
                    break

        if has_critical:
            risk_level = "HIGH"

        return RiskSummary(
            score=final_score,
            level=risk_level,
        )
