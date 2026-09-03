from abc import ABC, abstractmethod
from typing import Dict, List, Any
from app.models.user_request import ParsedRequest
from app.models.structuring_output import FieldExtractionResult

class BaseFieldExtractor(ABC):
    """Abstract base class for field extraction from candidates and raw context."""
    
    @abstractmethod
    def extract_fields(self, raw_text: str, candidate_map: Dict[str, List[Dict[str, Any]]], parsed_request: ParsedRequest) -> Dict[str, FieldExtractionResult]:
        """Extracts exact values, statuses, and confidence scores for requested fields."""
        pass
