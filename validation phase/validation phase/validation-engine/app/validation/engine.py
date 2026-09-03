import logging
from typing import Any, Dict, List, Optional
from app.models.document import BaseDocument
from app.models.validation_result import (
    Severity,
    ValidationReport,
    ValidationResultItem,
    ValidationStatus,
)
from app.risk.risk_engine import RiskEngine
from app.risk.router import RiskRouter
from app.validation.arithmetic_validator import ArithmeticValidator
from app.validation.base import BaseValidator
from app.validation.date_validator import DateValidator
from app.validation.duplicate_validator import DuplicateValidator
from app.validation.format_validator import FormatValidator

logger = logging.getLogger("ValidationEngine")


class ValidationEngine:
    def __init__(
        self,
        validators: Optional[List[BaseValidator]] = None,
        risk_engine: Optional[RiskEngine] = None,
        risk_router: Optional[RiskRouter] = None,
    ):
        # Strict 4 validation phases in order
        self.validators = validators or [
            ArithmeticValidator(),
            FormatValidator(),
            DuplicateValidator(),
            DateValidator(),
        ]
        self.risk_engine = risk_engine or RiskEngine()
        self.risk_router = risk_router or RiskRouter()

    def process_document(
        self,
        document: BaseDocument,
        context: Optional[Dict[str, Any]] = None,
    ) -> ValidationReport:
        """
        Processes ALL FOUR validation phases sequentially for the document.
        Guarantees that individual validator failures do NOT stop remaining validators from running.
        """
        results: List[ValidationResultItem] = []

        for validator in self.validators:
            try:
                res = validator.validate(document, context=context)
                results.append(res)
            except Exception as exc:
                logger.exception(f"Unhandled exception in validator '{validator.name}': {exc}")
                results.append(
                    ValidationResultItem(
                        validator=validator.name,
                        status=ValidationStatus.FAIL,
                        severity=Severity.HIGH,
                        risk_points=25,
                        message=f"Validator internal error: {str(exc)}",
                        details={"error": str(exc)},
                    )
                )

        # Calculate Risk Score (0 - 100) & Risk Level
        risk_summary = self.risk_engine.evaluate(results)

        # Determine Hard Routing Decision (AUTO_PROCESS vs HUMAN_REVIEW)
        routing_summary = self.risk_router.route(results)

        return ValidationReport(
            document_id=document.document_id,
            validation_results=results,
            risk=risk_summary,
            routing=routing_summary,
        )

    def process_batch(
        self,
        documents: List[BaseDocument],
        context: Optional[Dict[str, Any]] = None,
    ) -> List[ValidationReport]:
        """
        Processes a batch of documents independently.
        """
        reports = []
        for doc in documents:
            report = self.process_document(doc, context=context)
            reports.append(report)
        return reports
