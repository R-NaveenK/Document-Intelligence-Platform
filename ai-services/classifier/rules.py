import re
from typing import List, Dict, Tuple
from models import DocumentTypeModel

def normalize_text(text: str) -> str:
    if not text:
        return ""
    # Lowercase, punctuation cleanup, whitespace normalization
    cleaned = text.lower()
    cleaned = re.sub(r'[^a-z0-9\s]', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def calculate_rule_score(page_text: str, doc_types: List[DocumentTypeModel]) -> Dict[str, float]:
    """
    Computes exact/keyword normalized matching scores for each allowed document type.
    """
    norm_text = normalize_text(page_text)
    scores: Dict[str, float] = {}

    if not norm_text:
        return {dt.documentTypeId: 0.0 for dt in doc_types}

    for dt in doc_types:
        score = 0.0
        norm_name = normalize_text(dt.name)
        norm_key = dt.key.replace('_', ' ')

        # 1. Exact Name match
        if norm_name and norm_name in norm_text:
            score = max(score, 0.95)

        # 2. Key match
        if norm_key and norm_key in norm_text:
            score = max(score, 0.90)

        # 3. Aliases match
        if dt.aliases:
            for alias in dt.aliases:
                norm_alias = normalize_text(alias)
                if norm_alias and norm_alias in norm_text:
                    score = max(score, 0.90)

        # 4. Description phrase match
        if dt.description:
            norm_desc_words = [w for w in normalize_text(dt.description).split() if len(w) > 3]
            matched_words = [w for w in norm_desc_words if w in norm_text]
            if norm_desc_words:
                match_ratio = len(matched_words) / len(norm_desc_words)
                score = max(score, match_ratio * 0.70)

        scores[dt.documentTypeId] = round(score, 4)

    return scores
