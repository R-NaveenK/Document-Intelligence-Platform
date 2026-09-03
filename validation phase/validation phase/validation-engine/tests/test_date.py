import pytest
from app.models.document import BaseDocument
from app.models.validation_result import ValidationStatus
from app.validation.date_validator import DateValidator


def test_date_valid_pass():
    validator = DateValidator()
    doc = BaseDocument(
        document_id="INV-1001",
        document_type="invoice",
        raw_data={"invoice_date": "2026-09-02"},
    )
    result = validator.validate(doc)
    assert result.status == ValidationStatus.PASS
    assert result.details["normalized"] == "2026-09-02"


def test_date_invalid_calendar_fail():
    validator = DateValidator()
    doc = BaseDocument(
        document_id="INV-1005",
        document_type="invoice",
        raw_data={"invoice_date": "31-02-2026"},
    )
    result = validator.validate(doc)
    assert result.status == ValidationStatus.FAIL
    assert result.risk_points > 0
