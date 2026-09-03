from rapidfuzz import fuzz
from typing import List, Dict
from models import DocumentTypeModel
from rules import normalize_text

def calculate_fuzzy_score(page_text: str, doc_types: List[DocumentTypeModel]) -> Dict[str, float]:
    """
    Computes RapidFuzz fuzzy similarity scores for each allowed document type.
    """
    norm_text = normalize_text(page_text)
    scores: Dict[str, float] = {}

    if not norm_text:
        return {dt.documentTypeId: 0.0 for dt in doc_types}

    for dt in doc_types:
        best_ratio = 0.0

        # Compare against Name
        if dt.name:
            r1 = fuzz.partial_ratio(normalize_text(dt.name), norm_text) / 100.0
            r2 = fuzz.token_set_ratio(normalize_text(dt.name), norm_text) / 100.0
            best_ratio = max(best_ratio, r1, r2)

        # Compare against Aliases
        if dt.aliases:
            for alias in dt.aliases:
                r_alias = fuzz.partial_ratio(normalize_text(alias), norm_text) / 100.0
                best_ratio = max(best_ratio, r_alias)

        # Compare against Description
        if dt.description:
            r_desc = fuzz.token_set_ratio(normalize_text(dt.description), norm_text) / 100.0
            best_ratio = max(best_ratio, r_desc * 0.75)

        scores[dt.documentTypeId] = round(best_ratio, 4)

    return scores
