import pytest
from app.models.document import BaseDocument
from app.models.validation_result import ValidationStatus
from app.repositories.memory import InMemoryRepository
from app.validation.duplicate_validator import DuplicateValidator


def test_duplicate_exact_hash_match():
    repo = InMemoryRepository()
    doc1 = BaseDocument(
        document_id="INV-1001",
        document_type="invoice",
        raw_data={"invoice_number": "INV-1001", "total_amount": 59000},
    )
    repo.save_document(doc1)

    doc2 = BaseDocument(
        document_id="INV-1001-DUP",
        document_type="invoice",
        raw_data={"invoice_number": "INV-1001", "total_amount": 59000},
    )

    validator = DuplicateValidator()
    result = validator.validate(doc2, context={"repository": repo})
    assert result.status == ValidationStatus.FAIL
    assert result.severity.value == "CRITICAL"
    assert result.risk_points >= 35


def test_duplicate_near_match_warning():
    repo = InMemoryRepository()
    doc1 = BaseDocument(
        document_id="INV-0999",
        document_type="invoice",
        raw_data={
            "invoice_number": "INV-0999",
            "vendor_name": "ABC Suppliers Pvt Ltd",
            "total_amount": 59000,
        },
    )
    repo.save_document(doc1)

    doc2 = BaseDocument(
        document_id="INV-1006",
        document_type="invoice",
        raw_data={
            "invoice_number": "INV-0999",
            "vendor_name": "ABC Suppliers Pvt Ltd",
            "total_amount": 59000,
            "extra_note": "slightly different payload",
        },
    )

    validator = DuplicateValidator()
    result = validator.validate(doc2, context={"repository": repo})
    assert result.status in (ValidationStatus.WARNING, ValidationStatus.FAIL)
    assert result.risk_points > 0
