import re
from typing import Dict, List, Any
from app.models.user_request import ParsedRequest, FieldDefinition
from app.candidate_finder.base import BaseCandidateFinder
from app.candidate_finder.regex_rules import DETERMINISTIC_PATTERNS
from app.candidate_finder.fuzzy_search import find_fuzzy_candidates_in_lines
from app.core.exceptions import CandidateFinderError
from app.core.logging_config import logger

from app.semantic.representation import SemanticConceptSpace

class CandidateFinder(BaseCandidateFinder):
    """Hybrid Candidate Finder searching raw text for candidate snippets corresponding to requested fields."""

    def __init__(self):
        self.semantic_space = SemanticConceptSpace()

    def find_candidates(self, raw_text: str, parsed_request: ParsedRequest) -> Dict[str, List[Dict[str, Any]]]:
        if not raw_text:
            return {f.key: [] for f in parsed_request.requested_fields}

        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        candidate_map: Dict[str, List[Dict[str, Any]]] = {}

        for field in parsed_request.requested_fields:
            if field.is_list and field.nested_fields:
                candidate_map[field.key] = self._find_table_candidates(lines, field)
            else:
                candidate_map[field.key] = self._find_scalar_candidates(raw_text, lines, field)

        logger.info(f"Candidate Finder completed search across {len(lines)} lines for {len(parsed_request.requested_fields)} fields")
        return candidate_map

    def _find_scalar_candidates(self, raw_text: str, lines: List[str], field: FieldDefinition) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []

        # Tier 1: Regex rules if available (check field.key and aliases)
        patterns_to_run = []
        for pat_key in [field.key] + (field.aliases or []):
            if pat_key in DETERMINISTIC_PATTERNS:
                for p in DETERMINISTIC_PATTERNS[pat_key]:
                    if p not in patterns_to_run:
                        patterns_to_run.append(p)

        for pattern in patterns_to_run:
            for match in pattern.finditer(raw_text):
                l_start = raw_text.rfind('\n', 0, match.start()) + 1
                l_end = raw_text.find('\n', match.end())
                if l_end == -1:
                    l_end = len(raw_text)
                line_str = raw_text[l_start:l_end].strip()
                line_num = raw_text[:match.start()].count('\n') + 1
                candidates.append({
                    "snippet": line_str,
                    "confidence": 0.95,
                    "method": "regex",
                    "line": line_num
                })

        # Tier 2: Fuzzy keyword & alias matching across lines
        aliases = field.aliases or [field.key.replace("_", " ")]
        fuzzy_matches = find_fuzzy_candidates_in_lines(lines, aliases, threshold=70.0)
        
        for fm in fuzzy_matches:
            line_idx = fm["line_index"]
            line_text = lines[line_idx]
            
            candidates.append({
                "snippet": line_text,
                "confidence": min(0.90, fm["score"]),
                "method": "fuzzy_alias",
                "line": line_idx + 1,
                "matched_alias": fm["matched_alias"]
            })

        # Tier 3: Semantic concept search across document lines
        rep = self.semantic_space.get_representation(
            field_name=field.key,
            display_name=field.display_name,
            description=field.description,
            data_type=field.data_type
        )
        
        # Large document optimization: pre-filter lines for concept evaluation
        if len(lines) > 200:
            key_tokens = set(field.key.lower().replace("_", " ").split())
            key_tokens.update([t.lower() for t in (rep.concept_tokens or []) if len(t) > 3])
            eval_lines = []
            for idx, line in enumerate(lines):
                line_lower = line.lower()
                if any(tok in line_lower for tok in key_tokens) or any(c in line for c in [":", "Rs", "₹", "$", "€"]):
                    eval_lines.append((idx, line))
        else:
            eval_lines = [(idx, line) for idx, line in enumerate(lines)]

        for idx, line in eval_lines:
            sim = self.semantic_space.compute_similarity(line, rep)
            if sim >= 0.25:
                candidates.append({
                    "snippet": line,
                    "confidence": min(0.95, sim),
                    "method": "semantic",
                    "line": idx + 1
                })

        # Deduplicate while preserving highest confidence
        unique_candidates: Dict[str, Dict[str, Any]] = {}
        for c in candidates:
            snip = c["snippet"]
            if snip not in unique_candidates or c["confidence"] > unique_candidates[snip]["confidence"]:
                unique_candidates[snip] = c

        return sorted(list(unique_candidates.values()), key=lambda x: x["confidence"], reverse=True)

    def _find_table_candidates(self, lines: List[str], field: FieldDefinition) -> List[Dict[str, Any]]:
        table_candidates: List[Dict[str, Any]] = []
        in_items_section = False
        
        for idx, line in enumerate(lines):
            clean_l = line.strip()
            if not clean_l:
                continue
                
            if any(clean_l.lower().startswith(kw) for kw in ["items", "line items", "products", "particulars", "items delivered", "item details"]):
                in_items_section = True
                continue
                
            if in_items_section and any(clean_l.lower().startswith(kw) for kw in ["subtotal", "total", "bank details", "terms", "final settlement"]):
                in_items_section = False
                
            # Exclude addresses or contact info
            if any(kw in clean_l.lower() for kw in ["road", "street", "avenue", "boulevard", "estate", "nagar", "city", "gstin", "phone", "email", "cin", "karnataka", "india", "mumbai", "delhi"]):
                continue

            is_item_row = (in_items_section) or (re.match(r'^\d+\s+[A-Za-z]', clean_l) and len(clean_l.split()) >= 4)
            
            if is_item_row:
                table_candidates.append({
                    "snippet": clean_l,
                    "confidence": 0.90,
                    "method": "table_row",
                    "line": idx + 1
                })
                
        return table_candidates

    def _get_line_number(self, full_text: str, char_pos: int) -> int:
        return full_text[:char_pos].count('\n') + 1
