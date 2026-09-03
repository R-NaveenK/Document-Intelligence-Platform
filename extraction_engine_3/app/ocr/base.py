from abc import ABC, abstractmethod
from pathlib import Path
from typing import Union, Optional, Dict, Any, BinaryIO
from app.models.extraction_result import ExtractionResult


class BaseExtractionEngine(ABC):
    """
    Standard Extraction Engine Interface.
    All present and future extraction engines (Engine 1, Engine 2, Engine 3) MUST implement
    this contract to remain pluggable into the downstream Comparison Engine.
    """

    @abstractmethod
    def extract(
        self,
        document: Union[str, Path, bytes, BinaryIO],
        original_filename: Optional[str] = None,
        document_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> ExtractionResult:
        """
        Main extraction entry point.
        
        Args:
            document: Path to file, raw bytes, or file-like object.
            original_filename: Optional name of the original document.
            document_id: Optional tracking identifier.
            options: Optional runtime configuration parameters.
            
        Returns:
            ExtractionResult object matching the standard output schema.
        """
        pass

    @abstractmethod
    def get_engine_id(self) -> str:
        """Return unique engine identifier (e.g., 'engine_1')."""
        pass

    @abstractmethod
    def get_version(self) -> str:
        """Return engine implementation version string (e.g., '1.0.0')."""
        pass

    @abstractmethod
    def health_check(self) -> Dict[str, Any]:
        """
        Check engine operational readiness.
        
        Returns:
            Dict containing engine status, loaded models, memory usage, etc.
        """
        pass
