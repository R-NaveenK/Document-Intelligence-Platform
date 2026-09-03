from typing import Dict, List, Optional
from app.models.document import BaseDocument
from app.models.validation_result import ValidationReport
from app.repositories.base import BaseRepository


class InMemoryRepository(BaseRepository):
    def __init__(self):
        self._documents: Dict[str, BaseDocument] = {}
        self._reports: Dict[str, ValidationReport] = {}
        self._hashes: Dict[str, str] = {}  # file_hash -> document_id

    def save_document(self, document: BaseDocument) -> None:
        self._documents[document.document_id] = document
        h = document.calculate_sha256()
        self._hashes[h] = document.document_id

    def get_document(self, document_id: str) -> Optional[BaseDocument]:
        return self._documents.get(document_id)

    def find_by_hash(self, file_hash: str) -> Optional[BaseDocument]:
        doc_id = self._hashes.get(file_hash)
        if doc_id:
            return self._documents.get(doc_id)
        return None

    def get_all_documents(self, exclude_id: Optional[str] = None) -> List[BaseDocument]:
        return [doc for doc_id, doc in self._documents.items() if doc_id != exclude_id]

    def save_validation_report(self, report: ValidationReport) -> None:
        self._reports[report.document_id] = report

    def get_validation_report(self, document_id: str) -> Optional[ValidationReport]:
        return self._reports.get(document_id)

    def clear(self) -> None:
        self._documents.clear()
        self._reports.clear()
        self._hashes.clear()
