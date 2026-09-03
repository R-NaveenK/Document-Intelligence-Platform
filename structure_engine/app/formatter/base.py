from abc import ABC, abstractmethod
from typing import Dict, Any, List
from pydantic import BaseModel
from app.models.structuring_output import FieldExtractionResult, StructuringResponse

class BaseOutputFormatter(ABC):
    """Abstract base class for structuring response contract formatting."""
    
    @abstractmethod
    def format_response(
        self,
        document_id: str,
        structured_data_model: BaseModel,
        field_extraction_results: Dict[str, FieldExtractionResult],
        processing_time_ms: float,
        warnings: List[str] = None
    ) -> StructuringResponse:
        """Packages validated schema model & metadata into standard StructuringResponse contract."""
        pass
