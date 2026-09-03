from typing import List, Dict, Any, Optional
from rapidfuzz import fuzz
from app.core.config import settings

def find_fuzzy_candidates_in_lines(lines: List[str], target_aliases: List[str], threshold: Optional[float] = None) -> List[Dict[str, Any]]:
    min_score = threshold if threshold is not None else settings.FUZZY_MATCH_THRESHOLD
    matches = []
    
    for line_idx, line in enumerate(lines):
        clean_line = line.strip()
        if not clean_line:
            continue
            
        for alias in target_aliases:
            score = fuzz.partial_ratio(alias.lower(), clean_line.lower())
            if score >= min_score:
                matches.append({
                    "line_index": line_idx,
                    "line_text": clean_line,
                    "matched_alias": alias,
                    "score": round(score / 100.0, 3)
                })
                break
                
    return sorted(matches, key=lambda x: x["score"], reverse=True)
