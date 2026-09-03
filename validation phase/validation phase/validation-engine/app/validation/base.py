from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from app.models.document import BaseDocument
from app.models.validation_result import ValidationResultItem


class BaseValidator(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier name for this validator."""
        pass

    @abstractmethod
    def validate(self, document: BaseDocument, context: Optional[Dict[str, Any]] = None) -> ValidationResultItem:
        """
        Executes validation logic against the structured document.
        Returns a standardized ValidationResultItem.
        """
        pass
