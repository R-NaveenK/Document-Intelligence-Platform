from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional
from app.config.loader import get_risk_rules, get_validation_rules
from app.models.document import BaseDocument
from app.models.validation_result import (
    Severity,
    ValidationResultItem,
    ValidationStatus,
)
from app.validation.base import BaseValidator


def to_decimal(val: Any) -> Optional[Decimal]:
    if val is None or val == "":
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError, TypeError):
        return None


class ArithmeticValidator(BaseValidator):
    @property
    def name(self) -> str:
        return "arithmetic"

    def validate(self, document: BaseDocument, context: Optional[Dict[str, Any]] = None) -> ValidationResultItem:
        val_rules = get_validation_rules()
        arith_rules = val_rules.get("arithmetic", {})
        pct_thresholds = arith_rules.get("percentage_thresholds", {"negligible": 1.0, "minor": 5.0, "major": 20.0})

        risk_rules = get_risk_rules().get("risk_points", {}).get("arithmetic", {})

        raw_data = document.raw_data or {}
        items = raw_data.get("items", [])

        # Extract values or calculate from items
        extracted_total = to_decimal(raw_data.get("total_amount"))
        extracted_subtotal = to_decimal(raw_data.get("subtotal"))
        extracted_tax = to_decimal(raw_data.get("tax")) or to_decimal(raw_data.get("tax_amount")) or Decimal("0.0")

        # Line items calculation if present
        calc_line_sum = Decimal("0.0")
        if items and isinstance(items, list):
            for item in items:
                q = to_decimal(item.get("quantity"))
                p = to_decimal(item.get("unit_price"))
                if q is not None and p is not None:
                    calc_line_sum += (q * p)

        qty = to_decimal(raw_data.get("quantity"))
        unit_price = to_decimal(raw_data.get("unit_price"))

        if qty is not None and unit_price is not None:
            calc_line_sum = qty * unit_price

        effective_subtotal = extracted_subtotal if extracted_subtotal is not None else calc_line_sum
        expected_total = effective_subtotal + extracted_tax

        if extracted_total is None and extracted_subtotal is None and qty is None and not items:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.PASS,
                severity=Severity.LOW,
                risk_points=0,
                message="Arithmetic validation skipped: Document does not contain arithmetic fields",
                details={"skipped": True},
            )

        if extracted_total is None:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.HIGH,
                risk_points=risk_rules.get("high", 25),
                message="Total amount is missing from document",
                details={
                    "expected": float(expected_total),
                    "actual": None,
                    "difference": None,
                    "percentage_difference": None,
                },
            )

        diff = abs(extracted_total - expected_total)

        if expected_total > Decimal("0"):
            pct_diff = (diff / expected_total) * Decimal("100")
        else:
            pct_diff = Decimal("100") if diff > Decimal("0") else Decimal("0")

        pct_diff_float = round(float(pct_diff), 2)
        diff_float = float(diff)
        expected_float = float(expected_total)
        actual_float = float(extracted_total)

        details = {
            "expected": expected_float,
            "actual": actual_float,
            "difference": diff_float,
            "percentage_difference": pct_diff_float,
        }

        if diff == Decimal("0"):
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.PASS,
                severity=Severity.LOW,
                risk_points=risk_rules.get("pass", 0),
                message="Arithmetic validation passed",
                details=details,
            )

        # Magnitude-based severity & risk points calculation
        if pct_diff_float <= pct_thresholds.get("negligible", 1.0):
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.WARNING,
                severity=Severity.LOW,
                risk_points=risk_rules.get("low", 5),
                message=f"Negligible financial discrepancy detected ({pct_diff_float}% difference)",
                details=details,
            )
        elif pct_diff_float <= pct_thresholds.get("minor", 5.0):
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.MEDIUM,
                risk_points=risk_rules.get("medium", 15),
                message=f"Minor financial discrepancy detected ({pct_diff_float}% difference)",
                details=details,
            )
        elif pct_diff_float <= pct_thresholds.get("major", 20.0):
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.HIGH,
                risk_points=risk_rules.get("high", 25),
                message=f"Invoice total differs significantly from calculated total ({pct_diff_float}% difference)",
                details=details,
            )
        else:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.CRITICAL,
                risk_points=risk_rules.get("critical", 35),
                message=f"Critical financial anomaly detected ({pct_diff_float}% difference)",
                details=details,
            )
