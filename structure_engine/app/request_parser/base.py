from abc import ABC, abstractmethod
from app.models.user_request import ParsedRequest

class BaseRequestParser(ABC):
    """Abstract base class for natural language request parsing."""
    
    @abstractmethod
    def parse(self, request_text: str) -> ParsedRequest:
        """Converts natural language user request into structured field intent."""
        pass
