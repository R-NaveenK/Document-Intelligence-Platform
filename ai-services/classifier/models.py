from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class DocumentTypeModel(BaseModel):
    documentTypeId: str
    name: str
    key: str
    description: Optional[str] = ""
    aliases: Optional[List[str]] = []

class PageInputModel(BaseModel):
    pageNumber: int
    text: Optional[str] = ""
    ocrConfidence: Optional[float] = 1.0

class ClassifyRequest(BaseModel):
    jobId: str
    fileId: str
    schemaVersionId: Optional[str] = None
    pages: List[PageInputModel]
    allowedDocumentTypes: List[DocumentTypeModel]

class PageClassification(BaseModel):
    pageNumber: int
    documentTypeId: Optional[str] = None
    documentType: Optional[str] = None
    confidence: float
    classificationMethod: str  # RULES, FUZZY, HYBRID, AI, UNKNOWN
    boundary: str  # STARTS_NEW_DOCUMENT, CONTINUES_PREVIOUS_DOCUMENT, UNKNOWN_BOUNDARY
    requiresReview: bool
    reviewReason: Optional[str] = None
    scores: Optional[Dict[str, float]] = {}

class PageGroup(BaseModel):
    logicalDocumentId: str
    documentTypeId: Optional[str] = None
    documentType: Optional[str] = None
    pages: List[int]
    classificationConfidence: float
    requiresReview: bool
    reviewReason: Optional[str] = None

class ClassifyResponse(BaseModel):
    jobId: str
    fileId: str
    pageClassifications: List[PageClassification]
    pageGroups: List[PageGroup]
