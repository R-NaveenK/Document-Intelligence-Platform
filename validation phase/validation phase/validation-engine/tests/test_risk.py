import pytest
from app.models.validation_result import (
    Severity,
    ValidationResultItem,
    ValidationStatus,
)
from app.risk.risk_engine import RiskEngine


def test_risk_engine_points_sum_and_level():
    engine = RiskEngine()

    results = [
        ValidationResultItem(
            validator="arithmetic",
            status=ValidationStatus.FAIL,
            severity=Severity.HIGH,
            risk_points=25,
            message="Arithmetic error",
        ),
        ValidationResultItem(
            validator="format",
            status=ValidationStatus.PASS,
            severity=Severity.LOW,
            risk_points=0,
            message="Format valid",
        ),
    ]

    summary = engine.evaluate(results)
    assert summary.score == 25
    assert summary.level == "LOW"


def test_risk_engine_critical_override():
    engine = RiskEngine()

    results = [
        ValidationResultItem(
            validator="duplicate",
            status=ValidationStatus.FAIL,
            severity=Severity.CRITICAL,
            risk_points=35,
            message="Exact duplicate",
        )
    ]

    summary = engine.evaluate(results)
    assert summary.score == 35
    assert summary.level == "HIGH"
