"""Base handler interface for all document extraction types."""
from abc import ABC, abstractmethod
from pathlib import Path

from cor_engine.core.result import RawExtraction


class BaseDocumentHandler(ABC):
    """Abstract base class for document handlers."""

    @abstractmethod
    def extract(self, file_path: Path) -> RawExtraction:
        """Extract all textual & numerical data from file into common RawExtraction representation."""
        pass

    def process(self, file_path: Path) -> RawExtraction:
        """Alias for extract()."""
        return self.extract(file_path)
