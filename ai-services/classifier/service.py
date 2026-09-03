from typing import List, Dict, Any
from models import ClassifyRequest, ClassifyResponse, PageClassification, PageGroup
from scoring import calculate_hybrid_scores
from boundary import detect_page_boundaries
from grouping import group_pages_into_logical_documents

def process_classification(req: ClassifyRequest) -> ClassifyResponse:
    doc_types = req.allowedDocumentTypes
    doc_type_map = {dt.documentTypeId: dt for dt in doc_types}

    temp_page_classifications: List[Dict[str, Any]] = []

    # Step 1: Page-level classification & scoring
    for p in req.pages:
        best_dt_id, conf, method, scores, review_reason = calculate_hybrid_scores(
            page_text=p.text,
            doc_types=doc_types,
            ocr_confidence=p.ocrConfidence or 1.0
        )

        dt_obj = doc_type_map.get(best_dt_id) if best_dt_id else None
        dt_name = dt_obj.name if dt_obj else "UNKNOWN"
        requires_review = (conf < 0.85) or (best_dt_id is None)

        temp_page_classifications.append({
            "pageNumber": p.pageNumber,
            "documentTypeId": best_dt_id,
            "documentType": dt_name,
            "confidence": conf,
            "classificationMethod": method,
            "requiresReview": requires_review,
            "reviewReason": review_reason,
            "scores": scores
        })

    # Step 2: Boundary detection
    boundaries = detect_page_boundaries(temp_page_classifications, req.pages)

    # Attach boundary to classifications
    final_page_classifications: List[PageClassification] = []
    for idx, pc in enumerate(temp_page_classifications):
        pc["boundary"] = boundaries[idx]
        final_page_classifications.append(PageClassification(**pc))

    # Step 3: Logical document grouping
    page_groups = group_pages_into_logical_documents(temp_page_classifications, doc_types)

    return ClassifyResponse(
        jobId=req.jobId,
        fileId=req.fileId,
        pageClassifications=final_page_classifications,
        pageGroups=page_groups
    )
