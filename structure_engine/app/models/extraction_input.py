from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class PageInput(BaseModel):
    page_number: int = Field(..., description="1-indexed page number")
    raw_text: str = Field(..., description="Raw text extracted from this page")
    confidence: Optional[float] = Field(default=1.0, description="Page extraction confidence")
    character_count: Optional[int] = None
    word_count: Optional[int] = None

class RawExtractionInput(BaseModel):
    document_id: Optional[str] = Field(default="DOC_UNKNOWN", description="Unique document identifier")
    raw_text: str = Field(..., description="Unstructured concatenated raw text across pages")
    pages: Optional[List[PageInput]] = Field(default_factory=list, description="Per-page raw extractions")
    extraction_confidence: Optional[float] = Field(default=1.0, description="Aggregate extraction confidence")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Metadata from upstream extraction")
