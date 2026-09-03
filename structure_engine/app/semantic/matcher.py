"""
Semantic Field Matcher
Executes multi-source hybrid matching combining concept vector cosine similarity,
contextual positive/negative cues, value-type compatibility, and lexical alignment.
"""

from typing import Dict, Any, List, Optional, Tuple
import re
from rapidfuzz import fuzz
from pydantic import BaseModel, Field
from app.semantic.representation import FieldSemanticRepresentation, SemanticConceptSpace

class CandidateMatchScore(BaseModel):
    raw_snippet: str
    extracted_value: str
    source_line: Optional[int] = None
    semantic_score: float = 0.0
    context_score: float = 0.0
    type_score: float = 0.0
    lexical_score: float = 0.0
    composite_score: float = 0.0
    is_ambiguous: bool = False
    evidence: str = ""

class SemanticFieldMatcher:
    """Hybrid Semantic Matcher evaluating document candidates against field semantic representations."""

    def __init__(self):
        self.concept_space = SemanticConceptSpace()

    def evaluate_candidate(
        self,
        candidate_line: str,
        line_num: Optional[int],
        lines: List[str],
        rep: FieldSemanticRepresentation
    ) -> Optional[CandidateMatchScore]:
        """Evaluates a raw document line against a target FieldSemanticRepresentation."""
        clean_line = candidate_line.strip()
        if not clean_line:
            return None

        # 1. Semantic Concept Vector Similarity
        sem_sim = self.concept_space.compute_similarity(clean_line, rep)

        # 2. Contextual Positive & Negative Evidence
        context_score, extracted_val = self._evaluate_context(clean_line, line_num, lines, rep)
        if not extracted_val:
            extracted_val = self._extract_value_by_type(clean_line, rep.expected_type)
        if not extracted_val:
            return None

        # 3. Value-Type Compatibility
        type_score = self._evaluate_value_type(extracted_val, rep.expected_type)

        # 4. Lexical Similarity (label alignment)
        label_part = clean_line.split(":", 1)[0] if ":" in clean_line else clean_line
        lex_sim = max(
            fuzz.token_set_ratio(rep.display_name.lower(), label_part.lower()) / 100.0,
            fuzz.token_set_ratio(rep.field_name.lower(), label_part.lower()) / 100.0
        )

        # 5. Composite Ranking Score
        composite = (
            0.35 * sem_sim +
            0.25 * context_score +
            0.25 * type_score +
            0.15 * lex_sim
        )
        composite = max(0.0, min(1.0, composite))

        return CandidateMatchScore(
            raw_snippet=clean_line,
            extracted_value=extracted_val,
            source_line=line_num,
            semantic_score=round(sem_sim, 3),
            context_score=round(context_score, 3),
            type_score=round(type_score, 3),
            lexical_score=round(lex_sim, 3),
            composite_score=round(composite, 3),
            evidence=clean_line
        )

    def rank_candidates(
        self,
        candidates: List[Dict[str, Any]],
        lines: List[str],
        rep: FieldSemanticRepresentation
    ) -> Tuple[Optional[CandidateMatchScore], str, List[CandidateMatchScore]]:
        """
        Ranks evaluated candidates and resolves ambiguity or missing states.
        Returns: (best_match, status, all_ranked_candidates)
        """
        scored_candidates: List[CandidateMatchScore] = []
        for c in candidates:
            snippet = c.get("snippet", "")
            line_idx = c.get("line")
            score_res = self.evaluate_candidate(snippet, line_idx, lines, rep)
            if score_res and score_res.composite_score >= 0.35:
                scored_candidates.append(score_res)

        if not scored_candidates:
            return None, "not_found", []

        # Deduplicate candidates by normalized extracted value
        unique_matches: Dict[str, CandidateMatchScore] = {}
        for sc in scored_candidates:
            key = sc.extracted_value.strip().lower()
            if key not in unique_matches or sc.composite_score > unique_matches[key].composite_score:
                unique_matches[key] = sc

        ranked = sorted(list(unique_matches.values()), key=lambda x: x.composite_score, reverse=True)
        top = ranked[0]

        # Missing threshold
        if top.composite_score < 0.50:
            return None, "not_found", ranked

        # Ambiguity resolution: if top 2 have distinct values, both >= 0.65, and score difference < 0.05
        if len(ranked) >= 2:
            second = ranked[1]
            if top.composite_score >= 0.65 and second.composite_score >= 0.65:
                if (top.composite_score - second.composite_score) < 0.05:
                    top.is_ambiguous = True
                    return top, "ambiguous", ranked

        return top, "found", ranked

    def _evaluate_context(
        self,
        line: str,
        line_num: Optional[int],
        lines: List[str],
        rep: FieldSemanticRepresentation
    ) -> Tuple[float, Optional[str]]:
        """Calculates positive boost and negative penalty from surrounding lines."""
        score = 0.50
        lower = line.lower()

        # Check negative cues in current line
        for neg in rep.negative_context_cues:
            if neg in lower:
                score -= 0.35
                break

        # Check positive cues in current line
        has_pos_current = False
        for pos in rep.positive_context_cues:
            if pos in lower:
                score += 0.35
                has_pos_current = True
                break

        # Check preceding line context only for block headers (e.g. BILL TO on line 1, entity on line 2)
        if not has_pos_current and line_num is not None and line_num > 1 and line_num <= len(lines):
            prev_line = lines[line_num - 2].strip().lower()
            for pos in rep.positive_context_cues:
                if pos in prev_line:
                    score += 0.35
                    break
            for neg in rep.negative_context_cues:
                if neg in prev_line:
                    score -= 0.35
                    break

        extracted = self._extract_value_after_colon(line)
        if extracted and rep.expected_type == "tax_id":
            if not (re.search(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', extracted, re.IGNORECASE) or re.search(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', extracted, re.IGNORECASE)):
                extracted = None

        return max(0.0, min(1.0, score)), extracted

    def _extract_value_after_colon(self, line: str) -> Optional[str]:
        if ":" in line:
            after = line.split(":", 1)[1].strip()
            if after and not after.lower() in ["inv", "no", "number", "date", "amt"]:
                return after
        return None

    def _extract_value_by_type(self, line: str, expected_type: str) -> Optional[str]:
        """Extracts candidate value adhering strictly to expected data type."""
        # 1. Date
        if expected_type == "date":
            m = re.search(r'\b\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}\b', line)
            if m:
                return m.group(0)
            m2 = re.search(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b', line, re.IGNORECASE)
            if m2:
                return m2.group(0)
            return None

        # 2. Currency / Amount
        if expected_type == "currency":
            # Match currency with symbol or raw float
            m = re.search(r'([₹\$€£]?\s*[0-9,]+\.[0-9]{2})', line)
            if m:
                return m.group(1).strip()
            m2 = re.search(r'\b([0-9,]+\.[0-9]{2})\b', line)
            if m2:
                return m2.group(1).strip()
            return None

        # 3. Tax ID (GSTIN / PAN)
        if expected_type == "tax_id":
            m_gst = re.search(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', line, re.IGNORECASE)
            if m_gst:
                return m_gst.group(0)
            m_pan = re.search(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', line, re.IGNORECASE)
            if m_pan:
                return m_pan.group(0)
            return None

        # 4. Identifier / Code
        if expected_type == "identifier":
            # Skip pure dates
            if re.search(r'^\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}$', line.strip()):
                return None
            m = re.search(r'(?:no|number|num|#|id|ref)[:\s\.\#-]*([A-Z0-9\-/]{3,35})', line, re.IGNORECASE)
            if m:
                return m.group(1).strip()
            # General alphanumeric token
            tokens = [t for t in re.findall(r'\b[A-Z0-9\-/]{4,35}\b', line) if any(c.isdigit() for c in t) and any(c.isalpha() for c in t)]
            if tokens:
                return tokens[0]

        # 5. Entity Name / Text
        if expected_type == "entity_name":
            clean = re.sub(r'^(?:bill to|billed to|ship to|sold to|seller|vendor|merchant|customer|client|patient)\s*:\s*', '', line, flags=re.IGNORECASE)
            if len(clean.strip()) > 3 and not clean.strip().isdigit():
                return clean.strip()

        return line.strip() if len(line.strip()) > 2 else None

    def _evaluate_value_type(self, value: str, expected_type: str) -> float:
        """Scores how well the actual extracted string matches the expected value type."""
        val = value.strip()
        if expected_type == "date":
            return 1.0 if re.search(r'\b\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}\b', val) else 0.20
        if expected_type == "currency":
            return 1.0 if re.search(r'[0-9,]+\.[0-9]{2}', val) else (0.60 if any(c.isdigit() for c in val) else 0.10)
        if expected_type == "tax_id":
            return 1.0 if (re.search(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', val) or re.search(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', val)) else 0.10
        if expected_type == "identifier":
            # Penalize pure dates or plain English words
            if re.search(r'^\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}$', val):
                return 0.10
            return 0.90 if (any(c.isdigit() for c in val) and len(val) >= 3) else 0.50
        if expected_type == "entity_name":
            return 0.90 if (len(val) >= 4 and not val.isdigit()) else 0.30
        return 0.70
