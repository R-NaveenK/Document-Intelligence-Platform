from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.document import BaseDocument, DocumentLineItem


class InvoiceLineItem(DocumentLineItem):
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate: Optional[Decimal] = Decimal("0.0")


class InvoiceDocument(BaseDocument):
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    vendor_name: Optional[str] = None
    gst_number: Optional[str] = None
    po_number: Optional[str] = None
    items: List[InvoiceLineItem] = Field(default_factory=list)
    subtotal: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    total_amount: Optional[Decimal] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)
