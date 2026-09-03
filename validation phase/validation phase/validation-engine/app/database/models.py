from datetime import datetime, timezone
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.database.connection import Base


class DocumentModel(Base):
    __tablename__ = "documents"

    document_id = Column(String(100), primary_key=True, index=True)
    document_type = Column(String(50), nullable=False, index=True)
    file_hash = Column(String(64), nullable=False, index=True)
    raw_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    reports = relationship("ValidationReportModel", back_populates="document")


class ValidationReportModel(Base):
    __tablename__ = "validation_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(String(100), ForeignKey("documents.document_id"), nullable=False, index=True)
    risk_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)
    decision = Column(String(50), nullable=False)
    processed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    details = Column(JSON, nullable=True)

    document = relationship("DocumentModel", back_populates="reports")
