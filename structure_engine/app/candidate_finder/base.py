from abc import ABC, abstractmethod
from typing import Dict, List, Any
from app.models.user_request import ParsedRequest, FieldDefinition

class BaseCandidateFinder(ABC):
    """Abstract base class for raw text candidate searching."""
    
    @abstractmethod
    def find_candidates(self, raw_text: str, parsed_request: ParsedRequest) -> Dict[str, List[Dict[str, Any]]]:
        """Performs hybrid candidate search across raw text for requested fields."""
        pass
