from abc import ABC, abstractmethod
from typing import Dict, Any, Type
from pydantic import BaseModel
from app.models.structuring_output import FieldExtractionResult

class BaseStructuredGenerator(ABC):
    """Abstract base class for schema-constrained output generation."""
    
    @abstractmethod
    def generate(self, extracted_fields: Dict[str, FieldExtractionResult], schema_model: Type[BaseModel]) -> BaseModel:
        """Instantiates dynamic Pydantic schema enforcing validation constraints."""
        pass
