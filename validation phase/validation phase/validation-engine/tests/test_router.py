import pytest
from app.models.validation_result import (
    Severity,
    ValidationResultItem,
    ValidationStatus,
)
from app.risk.router import RiskRouter


def test_router_all_pass_auto_process():
    router = RiskRouter()

    results = [
        ValidationResultItem(validator="arithmetic", status=ValidationStatus.PASS, message="OK"),
        ValidationResultItem(validator="format", status=ValidationStatus.PASS, message="OK"),
        ValidationResultItem(validator="duplicate", status=ValidationStatus.PASS, message="OK"),
        ValidationResultItem(validator="date", status=ValidationStatus.PASS, message="OK"),
    ]

    summary = router.route(results)
    assert summary.decision == "AUTO_PROCESS"
    assert summary.reason == "All validations passed"


def test_router_one_fail_human_review():
    router = RiskRouter()

    results = [
        ValidationResultItem(validator="arithmetic", status=ValidationStatus.FAIL, message="Fail"),
        ValidationResultItem(validator="format", status=ValidationStatus.PASS, message="OK"),
        ValidationResultItem(validator="duplicate", status=ValidationStatus.PASS, message="OK"),
        ValidationResultItem(validator="date", status=ValidationStatus.PASS, message="OK"),
    ]

    summary = router.route(results)
    assert summary.decision == "HUMAN_REVIEW"
    assert "At least one validation did not pass" in summary.reason
