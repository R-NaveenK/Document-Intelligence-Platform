from abc import ABC, abstractmethod
from typing import List, Optional
from app.models.document import BaseDocument
from app.models.validation_result import ValidationReport


class BaseRepository(ABC):
    @abstractmethod
    def save_document(self, document: BaseDocument) -> None:
        """Saves a document into the repository."""
        pass

    @abstractmethod
    def get_document(self, document_id: str) -> Optional[BaseDocument]:
        """Fetches a document by document ID."""
        pass

    @abstractmethod
    def find_by_hash(self, file_hash: str) -> Optional[BaseDocument]:
        """Finds a document with identical SHA-256 file hash."""
        pass

    @abstractmethod
    def get_all_documents(self, exclude_id: Optional[str] = None) -> List[BaseDocument]:
        """Retrieves all stored documents."""
        pass

    @abstractmethod
    def save_validation_report(self, report: ValidationReport) -> None:
        """Saves a validation report."""
        pass

    @abstractmethod
    def get_validation_report(self, document_id: str) -> Optional[ValidationReport]:
        """Retrieves a stored validation report by document ID."""
        pass
