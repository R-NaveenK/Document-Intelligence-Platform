from decimal import Decimal
import pytest
from app.models.document import BaseDocument
from app.models.validation_result import ValidationStatus
from app.validation.arithmetic_validator import ArithmeticValidator


def test_arithmetic_pass():
    validator = ArithmeticValidator()
    doc = BaseDocument(
        document_id="INV-1001",
        document_type="invoice",
        raw_data={
            "quantity": 10,
            "unit_price": 5000,
            "subtotal": 50000,
            "tax": 9000,
            "total_amount": 59000,
        },
    )
    result = validator.validate(doc)
    assert result.status == ValidationStatus.PASS
    assert result.risk_points == 0


def test_arithmetic_minor_error_warning():
    validator = ArithmeticValidator()
    doc = BaseDocument(
        document_id="INV-1002",
        document_type="invoice",
        raw_data={
            "subtotal": 100000,
            "tax": 0,
            "total_amount": 100100,  # 0.1% diff
        },
    )
    result = validator.validate(doc)
    assert result.status in (ValidationStatus.WARNING, ValidationStatus.FAIL)
    assert result.details["percentage_difference"] == 0.1


def test_arithmetic_major_error_fail():
    validator = ArithmeticValidator()
    doc = BaseDocument(
        document_id="INV-1003",
        document_type="invoice",
        raw_data={
            "subtotal": 100000,
            "tax": 0,
            "total_amount": 150000,  # 50% diff
        },
    )
    result = validator.validate(doc)
    assert result.status == ValidationStatus.FAIL
    assert result.severity.value == "CRITICAL" or result.severity.value == "HIGH"
    assert result.risk_points >= 25
