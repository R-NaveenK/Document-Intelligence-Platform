from abc import ABC, abstractmethod
from typing import Type, Dict, Any
from pydantic import BaseModel
from app.models.user_request import ParsedRequest

class BaseSchemaBuilder(ABC):
    """Abstract base class for dynamic schema generation."""
    
    @abstractmethod
    def build_pydantic_model(self, parsed_request: ParsedRequest) -> Type[BaseModel]:
        """Dynamically constructs Pydantic BaseModel for target schema."""
        pass
    
    @abstractmethod
    def build_json_schema(self, pydantic_model: Type[BaseModel]) -> Dict[str, Any]:
        """Exports target dynamic schema as standard JSON Schema."""
        pass
