from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.document import BaseDocument, DocumentLineItem


class POLineItem(DocumentLineItem):
    description: str
    quantity: Decimal
    unit_price: Decimal


class PurchaseOrderDocument(BaseDocument):
    po_number: Optional[str] = None
    po_date: Optional[str] = None
    vendor_name: Optional[str] = None
    items: List[POLineItem] = Field(default_factory=list)
    total_amount: Optional[Decimal] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)
