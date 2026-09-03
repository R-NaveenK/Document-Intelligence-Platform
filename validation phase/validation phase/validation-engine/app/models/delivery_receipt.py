from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.document import BaseDocument, DocumentLineItem


class DeliveryLineItem(DocumentLineItem):
    description: str
    quantity_delivered: Decimal


class DeliveryReceiptDocument(BaseDocument):
    delivery_date: Optional[str] = None
    po_number: Optional[str] = None
    vendor_name: Optional[str] = None
    items: List[DeliveryLineItem] = Field(default_factory=list)

    model_config = ConfigDict(arbitrary_types_allowed=True)
