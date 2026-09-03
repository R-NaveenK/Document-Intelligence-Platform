import hashlib
import json
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DocumentLineItem(BaseModel):
    description: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    quantity_delivered: Optional[Decimal] = None
    quantity_billed: Optional[Decimal] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)


class BaseDocument(BaseModel):
    document_id: str
    document_type: str
    raw_data: Dict[str, Any] = Field(default_factory=dict)
    file_hash: Optional[str] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def calculate_sha256(self) -> str:
        if self.file_hash:
            return self.file_hash
        # Canonical JSON string representation for stable hash calculation
        serialized = json.dumps(self.raw_data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
