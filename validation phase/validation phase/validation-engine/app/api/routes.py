from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, status
from app.models.document import BaseDocument
from app.models.validation_result import ValidationReport
from app.repositories.memory import InMemoryRepository
from app.validation.engine import ValidationEngine

router = APIRouter()

_global_repo = InMemoryRepository()


@router.get("/health", tags=["Health"])
@router.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "service": "Validation Engine API",
        "version": "1.0.0",
    }


@router.post("/validate", tags=["Validation"])
@router.post("/api/v1/validate", tags=["Validation"])
async def validate_single_document(payload: Dict[str, Any]):
    """
    Validates a single structured document through all 4 validation phases,
    calculates risk score, and determines routing decision.
    """
    doc_id = (
        payload.get("logicalDocumentId")
        or payload.get("document_id")
        or payload.get("documentId")
        or payload.get("invoice_number")
        or "DOC-TEMP"
    )
    doc_type = payload.get("documentTypeId") or payload.get("document_type") or "invoice"
    org_id = (
        payload.get("organizationId")
        or payload.get("organization_id")
        or payload.get("tenantId")
    )

    raw_data = {}
    if "fields" in payload and isinstance(payload["fields"], list):
        for f in payload["fields"]:
            k = f.get("fieldKey")
            v = f.get("effectiveValue") if f.get("effectiveValue") is not None else (f.get("normalizedValue") if f.get("normalizedValue") is not None else f.get("value"))
            if k is not None:
                raw_data[k] = v
    else:
        raw_data = payload.get("raw_data") or payload

    if "document_id" not in raw_data:
        raw_data["document_id"] = doc_id

    if org_id and "organizationId" not in raw_data:
        raw_data["organizationId"] = org_id
        raw_data["organization_id"] = org_id

    document = BaseDocument(
        document_id=doc_id,
        document_type=doc_type,
        raw_data=raw_data,
    )

    _global_repo.save_document(document)
    engine = ValidationEngine()

    try:
        report = engine.process_document(document, context={"repository": _global_repo})
        _global_repo.save_validation_report(report)

        report_dict = report.model_dump() if hasattr(report, 'model_dump') else report.dict()

        requires_review = report_dict.get("routing", {}).get("decision") == "HUMAN_REVIEW"
        status_str = "PASSED" if not requires_review else "FAILED"

        mapped_results = []
        review_reasons = []
        for item in report_dict.get("validation_results", []):
            passed = item.get("status") == "PASS"
            v_name = item.get("validator", "general")
            mapped_item = {
                "type": v_name.upper(),
                "validator": v_name,
                "status": item.get("status"),
                "passed": passed,
                "severity": item.get("severity"),
                "riskPoints": item.get("risk_points", 0),
                "message": item.get("message"),
                "fieldKey": item.get("fieldKey") or v_name,
                "fieldKeys": [item.get("fieldKey")] if item.get("fieldKey") else [v_name],
                "details": item.get("details", {})
            }
            mapped_results.append(mapped_item)
            if not passed:
                review_reasons.append(f"{v_name.upper()}_VALIDATION_FAILED")

        return {
            "jobId": payload.get("jobId", "job_001"),
            "logicalDocumentId": doc_id,
            "document_id": doc_id,
            "status": status_str,
            "validationResults": mapped_results,
            "validation_results": report_dict.get("validation_results", []),
            "risk": report_dict.get("risk", {}),
            "routing": report_dict.get("routing", {}),
            "requiresReview": requires_review,
            "reviewReasons": review_reasons
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"status": "ERROR", "message": f"Unable to validate document: {str(err)}"},
        )


@router.post("/validate/batch", response_model=List[ValidationReport], tags=["Validation"])
@router.post("/api/v1/validate/batch", response_model=List[ValidationReport], tags=["Validation"])
async def validate_batch_documents(payloads: List[Dict[str, Any]]):
    """
    Validates a batch of structured documents.
    """
    if not payloads:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Batch request payload cannot be empty")

    docs = []
    for idx, raw in enumerate(payloads):
        doc_id = raw.get("document_id") or f"DOC-BATCH-{idx+1}"
        doc_type = raw.get("document_type", "invoice")
        doc = BaseDocument(document_id=doc_id, document_type=doc_type, raw_data=raw)
        _global_repo.save_document(doc)
        docs.append(doc)

    engine = ValidationEngine()
    try:
        reports = engine.process_batch(docs, context={"repository": _global_repo})
        for rep in reports:
            _global_repo.save_validation_report(rep)
        return reports
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"status": "ERROR", "message": f"Unable to validate document batch: {str(err)}"},
        )
