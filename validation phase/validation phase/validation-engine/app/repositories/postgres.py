from typing import List, Optional
from sqlalchemy.orm import Session
from app.database.models import DocumentModel, ValidationReportModel
from app.models.document import BaseDocument
from app.models.validation_result import ValidationReport
from app.repositories.base import BaseRepository


class PostgresRepository(BaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def save_document(self, document: BaseDocument) -> None:
        file_hash = document.calculate_sha256()
        existing = self.db.query(DocumentModel).filter_by(document_id=document.document_id).first()
        if existing:
            existing.raw_data = document.raw_data
            existing.file_hash = file_hash
            existing.document_type = document.document_type
        else:
            db_doc = DocumentModel(
                document_id=document.document_id,
                document_type=document.document_type,
                file_hash=file_hash,
                raw_data=document.raw_data,
            )
            self.db.add(db_doc)
        self.db.commit()

    def get_document(self, document_id: str) -> Optional[BaseDocument]:
        rec = self.db.query(DocumentModel).filter_by(document_id=document_id).first()
        if rec:
            return BaseDocument(
                document_id=rec.document_id,
                document_type=rec.document_type,
                file_hash=rec.file_hash,
                raw_data=rec.raw_data,
            )
        return None

    def find_by_hash(self, file_hash: str) -> Optional[BaseDocument]:
        rec = self.db.query(DocumentModel).filter_by(file_hash=file_hash).first()
        if rec:
            return BaseDocument(
                document_id=rec.document_id,
                document_type=rec.document_type,
                file_hash=rec.file_hash,
                raw_data=rec.raw_data,
            )
        return None

    def get_all_documents(self, exclude_id: Optional[str] = None) -> List[BaseDocument]:
        query = self.db.query(DocumentModel)
        if exclude_id:
            query = query.filter(DocumentModel.document_id != exclude_id)
        records = query.all()
        return [
            BaseDocument(
                document_id=r.document_id,
                document_type=r.document_type,
                file_hash=r.file_hash,
                raw_data=r.raw_data,
            )
            for r in records
        ]

    def save_validation_report(self, report: ValidationReport) -> None:
        db_report = ValidationReportModel(
            document_id=report.document_id,
            risk_score=report.risk.score,
            risk_level=report.risk.level,
            decision=report.routing.decision,
            details=report.model_dump(),
        )
        self.db.add(db_report)
        self.db.commit()

    def get_validation_report(self, document_id: str) -> Optional[ValidationReport]:
        rec = (
            self.db.query(ValidationReportModel)
            .filter_by(document_id=document_id)
            .order_by(ValidationReportModel.id.desc())
            .first()
        )
        if rec and rec.details:
            return ValidationReport.model_validate(rec.details)
        return None
