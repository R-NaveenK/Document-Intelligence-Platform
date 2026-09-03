import re
from typing import Any, Dict, List, Optional
from app.config.loader import get_risk_rules, get_validation_rules
from app.models.document import BaseDocument
from app.models.validation_result import (
    Severity,
    ValidationResultItem,
    ValidationStatus,
)
from app.validation.base import BaseValidator


class FormatValidator(BaseValidator):
    @property
    def name(self) -> str:
        return "format"

    def validate(self, document: BaseDocument, context: Optional[Dict[str, Any]] = None) -> ValidationResultItem:
        val_rules = get_validation_rules()
        patterns: Dict[str, str] = val_rules.get("format", {}).get("patterns", {})

        risk_rules = get_risk_rules().get("risk_points", {}).get("format", {})

        raw_data = document.raw_data or {}
        checked_fields: Dict[str, Any] = {}
        invalid_fields: List[Dict[str, str]] = []

        aliases: Dict[str, List[str]] = {
            "gst_number": ["gstin", "gst_no", "gst"],
            "email": ["email_address", "mail"],
            "phone_number": ["phone", "mobile", "contact_number", "telephone"],
            "invoice_number": ["invoice_no", "inv_number", "bill_no", "bill_number"],
            "po_number": ["purchase_order_number", "po_no", "order_number"],
            "pincode": ["postal_code", "zip_code", "zip"],
        }

        for field_name, pattern in patterns.items():
            candidate_keys = [field_name] + aliases.get(field_name, [])
            for k in candidate_keys:
                if k in raw_data:
                    val = raw_data[k]
                    if val is not None and str(val).strip() != "":
                        val_str = str(val).strip()
                        checked_fields[k] = val_str
                        if not re.match(pattern, val_str):
                            invalid_fields.append({
                                "field": k,
                                "actual": val_str,
                                "expected_pattern": pattern,
                            })

        if invalid_fields:
            failed_field_names = [f["field"] for f in invalid_fields]
            field_str = ", ".join(failed_field_names)
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.HIGH,
                risk_points=risk_rules.get("high", 10),
                message=f"Format validation failed for field(s): {field_str}",
                details={
                    "checked_fields": checked_fields,
                    "invalid_fields": invalid_fields,
                },
            )

        return ValidationResultItem(
            validator=self.name,
            status=ValidationStatus.PASS,
            severity=Severity.LOW,
            risk_points=risk_rules.get("pass", 0),
            message="Format validation passed for all checked fields",
            details={"checked_fields": checked_fields},
        )
