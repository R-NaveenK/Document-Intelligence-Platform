import pytest
from app.models.document import BaseDocument
from app.models.validation_result import ValidationStatus
from app.validation.format_validator import FormatValidator


def test_format_gst_pass():
    validator = FormatValidator()
    doc = BaseDocument(
        document_id="INV-1001",
        document_type="invoice",
        raw_data={"gst_number": "33ABCDE1234F1Z5"},
    )
    result = validator.validate(doc)
    assert result.status == ValidationStatus.PASS
    assert result.risk_points == 0


def test_format_gst_fail():
    validator = FormatValidator()
    doc = BaseDocument(
        document_id="INV-1004",
        document_type="invoice",
        raw_data={"gst_number": "ABC123INVALID"},
    )
    result = validator.validate(doc)
    assert result.status == ValidationStatus.FAIL
    assert result.risk_points > 0
