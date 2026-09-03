from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field

class CandidateInfo(BaseModel):
    snippet: str
    confidence: float
    source_line: Optional[int] = None

class FieldExtractionResult(BaseModel):
    field: str
    value: Optional[Union[str, int, float, List[Dict[str, Any]]]] = None
    status: str = Field(..., description="Status: 'found', 'not_found', 'ambiguous'")
    confidence: float = Field(default=0.0, description="Structuring confidence score (0.0 - 1.0)")
    evidence: Optional[str] = Field(default=None, description="Exact candidate text snippet evidence")
    candidates: List[CandidateInfo] = Field(default_factory=list, description="Candidate matches if ambiguous")

class StructuringSummary(BaseModel):
    total_requested: int
    found_count: int
    not_found_count: int
    ambiguous_count: int

class StructuringResponse(BaseModel):
    status: str = Field(..., description="Overall status: 'success', 'partial_success', 'error'")
    document_id: str
    structured_data: Dict[str, Any] = Field(..., description="Data payload strictly conforming to target schema")
    field_status: Dict[str, str] = Field(..., description="Map of field key to status ('found', 'not_found', 'ambiguous')")
    field_details: Optional[Dict[str, FieldExtractionResult]] = Field(default=None, description="Field extraction details including evidence & confidence")
    summary: StructuringSummary
    processing_time_ms: float
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
