from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ValidationStatus(str, Enum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ValidationResultItem(BaseModel):
    validator: str
    status: ValidationStatus
    severity: Severity = Severity.LOW
    risk_points: int = Field(default=0, ge=0)
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(arbitrary_types_allowed=True)


class RiskSummary(BaseModel):
    score: int = Field(ge=0, le=100)
    level: str  # LOW, MEDIUM, HIGH

    model_config = ConfigDict(arbitrary_types_allowed=True)


class RoutingSummary(BaseModel):
    decision: str  # AUTO_PROCESS, HUMAN_REVIEW
    reason: str

    model_config = ConfigDict(arbitrary_types_allowed=True)


class ValidationReport(BaseModel):
    document_id: str
    validation_results: List[ValidationResultItem] = Field(default_factory=list)
    risk: RiskSummary
    routing: RoutingSummary
    processed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    model_config = ConfigDict(arbitrary_types_allowed=True)
