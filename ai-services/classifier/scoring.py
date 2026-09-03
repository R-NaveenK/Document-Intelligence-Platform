from typing import List, Dict, Tuple, Optional
from models import DocumentTypeModel
from rules import calculate_rule_score
from fuzzy import calculate_fuzzy_score
from gemini_client import classify_with_gemini
from config import settings

def calculate_hybrid_scores(
    page_text: str,
    doc_types: List[DocumentTypeModel],
    ocr_confidence: float = 1.0
) -> Tuple[Optional[str], float, str, Dict[str, float], Optional[str]]:
    """
    Computes weighted hybrid classification score across Keyword, Fuzzy, and AI signals.
    Returns: (best_doc_type_id, final_confidence, method_used, score_breakdown, review_reason)
    """
    if not page_text or len(page_text.strip()) < 5:
        return (None, 0.0, "UNKNOWN", {"keyword": 0.0, "fuzzy": 0.0, "ai": 0.0, "final": 0.0}, "INSUFFICIENT_PAGE_CONTENT")

    if not doc_types:
        return (None, 0.0, "UNKNOWN", {"keyword": 0.0, "fuzzy": 0.0, "ai": 0.0, "final": 0.0}, "UNKNOWN_DOCUMENT_TYPE")

    rule_scores = calculate_rule_score(page_text, doc_types)
    fuzzy_scores = calculate_fuzzy_score(page_text, doc_types)

    # Evaluate best local candidate
    candidate_scores: Dict[str, float] = {}
    for dt in doc_types:
        dt_id = dt.documentTypeId
        k_score = rule_scores.get(dt_id, 0.0)
        f_score = fuzzy_scores.get(dt_id, 0.0)

        # Weighted combination of keyword and fuzzy signals
        local_score = (k_score * settings.KEYWORD_WEIGHT) + (f_score * settings.FUZZY_WEIGHT)
        total_rule_weight = settings.KEYWORD_WEIGHT + settings.FUZZY_WEIGHT
        normalized_local = local_score / total_rule_weight if total_rule_weight > 0 else 0.0

        candidate_scores[dt_id] = round(normalized_local, 4)

    # Find highest scoring document type
    best_dt_id = max(candidate_scores, key=candidate_scores.get) if candidate_scores else None
    best_local_score = candidate_scores.get(best_dt_id, 0.0) if best_dt_id else 0.0

    # Determine classification method & AI fallback
    ai_score = 0.0
    ai_used = False
    review_reason = None
    method = "HYBRID"

    if best_local_score >= settings.HIGH_CONFIDENCE_THRESHOLD:
        method = "RULES" if rule_scores.get(best_dt_id, 0.0) >= 0.9 else "FUZZY"
        final_conf = best_local_score
    else:
        # Trigger Gemini AI fallback if local confidence is uncertain
        ai_dt_id, ai_conf, ai_reason = classify_with_gemini(page_text, doc_types)
        if ai_dt_id:
            ai_used = True
            method = "AI" if best_local_score < 0.5 else "HYBRID"
            # If AI matches local best choice, boost confidence
            if ai_dt_id == best_dt_id:
                final_conf = (best_local_score * (settings.KEYWORD_WEIGHT + settings.FUZZY_WEIGHT) + ai_conf * settings.AI_WEIGHT)
            else:
                best_dt_id = ai_dt_id
                final_conf = ai_conf
        else:
            final_conf = best_local_score

    # Adjust for low OCR confidence
    if ocr_confidence < 0.80:
        ocr_factor = max(0.2, ocr_confidence / 0.80)
        final_conf = final_conf * ocr_factor

    final_conf = round(final_conf, 4)

    # Determine if review is needed and reasons
    if not best_dt_id or final_conf < settings.REVIEW_THRESHOLD:
        review_reason = "LOW_CLASSIFICATION_CONFIDENCE" if best_dt_id else "UNKNOWN_DOCUMENT_TYPE"
    elif best_dt_id and final_conf < settings.HIGH_CONFIDENCE_THRESHOLD:
        review_reason = "AMBIGUOUS_DOCUMENT_TYPE"

    scores_breakdown = {
        "keyword": rule_scores.get(best_dt_id, 0.0) if best_dt_id else 0.0,
        "fuzzy": fuzzy_scores.get(best_dt_id, 0.0) if best_dt_id else 0.0,
        "ai": ai_score,
        "final": final_conf
    }

    return (best_dt_id, final_conf, method, scores_breakdown, review_reason)
