import uuid
from typing import List, Dict, Any
from models import PageGroup, DocumentTypeModel

def group_pages_into_logical_documents(
    page_classifications: List[Dict[str, Any]],
    doc_types: List[DocumentTypeModel]
) -> List[PageGroup]:
    """
    Groups classified pages into logical documents based on page boundaries and continuity.
    Pages with the same document type that are separated by another document or explicit start boundary
    remain in distinct logical document groups!
    """
    groups: List[PageGroup] = []
    doc_type_map = {dt.documentTypeId: dt for dt in doc_types}

    current_pages: List[int] = []
    current_dt_id: str = None
    current_conf_sum: float = 0.0
    current_review: bool = False
    current_reasons: List[str] = []

    def finalize_group():
        nonlocal current_pages, current_dt_id, current_conf_sum, current_review, current_reasons
        if not current_pages:
            return

        avg_conf = round(current_conf_sum / len(current_pages), 4)
        dt_obj = doc_type_map.get(current_dt_id) if current_dt_id else None
        dt_name = dt_obj.name if dt_obj else "UNKNOWN"

        reason = current_reasons[0] if current_reasons else None
        if not current_dt_id and not reason:
            reason = "UNKNOWN_DOCUMENT_TYPE"

        group = PageGroup(
            logicalDocumentId=f"logical_doc_{uuid.uuid4().hex[:8]}",
            documentTypeId=current_dt_id,
            documentType=dt_name,
            pages=list(current_pages),
            classificationConfidence=avg_conf,
            requiresReview=current_review or (avg_conf < 0.85),
            reviewReason=reason
        )
        groups.append(group)

        current_pages = []
        current_dt_id = None
        current_conf_sum = 0.0
        current_review = False
        current_reasons = []

    for pc in page_classifications:
        p_num = pc.get("pageNumber")
        p_dt_id = pc.get("documentTypeId")
        boundary = pc.get("boundary", "STARTS_NEW_DOCUMENT")
        req_review = pc.get("requiresReview", False)
        rev_reason = pc.get("reviewReason")

        # If page starts a new document or document type changes, finalize previous group
        if boundary == "STARTS_NEW_DOCUMENT" or (current_pages and p_dt_id != current_dt_id):
            finalize_group()

        current_pages.append(p_num)
        current_dt_id = p_dt_id
        current_conf_sum += pc.get("confidence", 0.0)
        if req_review:
            current_review = True
        if rev_reason and rev_reason not in current_reasons:
            current_reasons.append(rev_reason)

    finalize_group()
    return groups
