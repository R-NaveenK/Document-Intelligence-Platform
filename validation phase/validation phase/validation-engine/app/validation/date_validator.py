from datetime import datetime
from typing import Any, Dict, Optional
from dateutil import parser
from app.config.loader import get_risk_rules, get_validation_rules
from app.models.document import BaseDocument
from app.models.validation_result import (
    Severity,
    ValidationResultItem,
    ValidationStatus,
)
from app.validation.base import BaseValidator


class DateValidator(BaseValidator):
    @property
    def name(self) -> str:
        return "date"

    def validate(self, document: BaseDocument, context: Optional[Dict[str, Any]] = None) -> ValidationResultItem:
        risk_rules = get_risk_rules().get("risk_points", {}).get("date", {})
        raw_data = document.raw_data or {}

        # Look for invoice_date, po_date, delivery_date, or general date field
        date_val = (
            raw_data.get("invoice_date")
            or raw_data.get("po_date")
            or raw_data.get("delivery_date")
            or raw_data.get("date")
        )

        if not date_val:
            for k, v in raw_data.items():
                if 'date' in k.lower() and v:
                    date_val = v
                    break

        if not date_val:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.PASS,
                severity=Severity.LOW,
                risk_points=0,
                message="Date validation skipped: No date field present in document",
                details={"skipped": True},
            )

        date_str = str(date_val).strip()

        try:
            # Parse date using dateutil parser
            parsed_dt = parser.parse(date_str)
            normalized_date = parsed_dt.strftime("%Y-%m-%d")

            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.PASS,
                severity=Severity.LOW,
                risk_points=risk_rules.get("pass", 0),
                message="Date validation passed",
                details={
                    "raw": date_str,
                    "normalized": normalized_date,
                },
            )
        except (ValueError, TypeError, OverflowError) as err:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.HIGH,
                risk_points=risk_rules.get("high", 15),
                message=f"Date validation failed: '{date_str}' is an invalid or malformed date",
                details={
                    "raw": date_str,
                    "error": str(err),
                },
            )
