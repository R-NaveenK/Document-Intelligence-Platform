from typing import Any, Dict, List, Optional
from app.config.loader import get_risk_rules
from app.models.validation_result import (
    RoutingSummary,
    ValidationResultItem,
    ValidationStatus,
)


class RiskRouter:
    def __init__(self, risk_rules: Optional[Dict[str, Any]] = None):
        self._rules = risk_rules

    @property
    def rules(self) -> Dict[str, Any]:
        if self._rules is None:
            self._rules = get_risk_rules()
        return self._rules

    def route(self, results: List[ValidationResultItem]) -> RoutingSummary:
        """
        Hard Routing Gate:
        Validation status determines routing.
        IF ALL 4 VALIDATIONS PASS -> AUTO_PROCESS
        IF EVEN ONE VALIDATION IS NOT PASS (FAIL or WARNING) -> HUMAN_REVIEW
        """
        all_pass = all(res.status == ValidationStatus.PASS for res in results)

        if all_pass:
            return RoutingSummary(
                decision="AUTO_PROCESS",
                reason="All validations passed",
            )
        else:
            failed_validators = [r.validator for r in results if r.status != ValidationStatus.PASS]
            failed_str = ", ".join(failed_validators)
            return RoutingSummary(
                decision="HUMAN_REVIEW",
                reason=f"At least one validation did not pass ({failed_str})",
            )
