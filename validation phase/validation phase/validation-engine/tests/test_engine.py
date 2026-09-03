import pytest
from app.models.document import BaseDocument
from app.models.validation_result import ValidationStatus
from app.repositories.memory import InMemoryRepository
from app.validation.engine import ValidationEngine


def test_engine_executes_all_4_validators():
    engine = ValidationEngine()
    doc = BaseDocument(
        document_id="INV-1001",
        document_type="invoice",
        raw_data={
            "document_id": "INV-1001",
            "invoice_number": "INV-1001",
            "invoice_date": "2026-09-02",
            "vendor_name": "ABC Suppliers Pvt Ltd",
            "gst_number": "33ABCDE1234F1Z5",
            "quantity": 10,
            "unit_price": 5000,
            "subtotal": 50000,
            "tax": 9000,
            "total_amount": 59000,
        },
    )

    report = engine.process_document(doc)

    assert len(report.validation_results) == 4
    validator_names = [r.validator for r in report.validation_results]
    assert validator_names == ["arithmetic", "format", "duplicate", "date"]

    assert report.risk.score == 0
    assert report.routing.decision == "AUTO_PROCESS"


def test_engine_runs_all_validators_even_if_arithmetic_fails():
    engine = ValidationEngine()
    # Major arithmetic error + invalid format + invalid date
    doc = BaseDocument(
        document_id="INV-MULTIPLE",
        document_type="invoice",
        raw_data={
            "document_id": "INV-MULTIPLE",
            "invoice_number": "INVALID-NO",
            "invoice_date": "31-02-2026",
            "vendor_name": "ABC Suppliers",
            "gst_number": "BAD-GST",
            "subtotal": 100000,
            "total_amount": 150000,  # 50% diff
        },
    )

    report = engine.process_document(doc)

    # All 4 validators MUST execute
    assert len(report.validation_results) == 4

    arith_res = next(r for r in report.validation_results if r.validator == "arithmetic")
    format_res = next(r for r in report.validation_results if r.validator == "format")
    date_res = next(r for r in report.validation_results if r.validator == "date")

    assert arith_res.status == ValidationStatus.FAIL
    assert format_res.status == ValidationStatus.FAIL
    assert date_res.status == ValidationStatus.FAIL

    assert report.routing.decision == "HUMAN_REVIEW"
