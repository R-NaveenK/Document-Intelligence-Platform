import re
from typing import List, Dict, Any, Tuple, Optional
from app.models.user_request import ParsedRequest, FieldDefinition
from app.request_parser.base import BaseRequestParser
from app.core.exceptions import RequestParsingError
from app.core.logging_config import logger

KNOWN_SYNONYMS: Dict[str, Dict[str, Any]] = {
    "invoice_number": {
        "aliases": ["invoice number", "invoice no", "inv no", "inv number", "bill number", "bill no", "invoice id", "invoice_num", "receipt number"],
        "type": "string"
    },
    "invoice_date": {
        "aliases": ["invoice date", "bill date", "date of invoice", "issue date", "billing date", "document date", "test date", "joining date", "date"],
        "type": "date"
    },
    "customer_name": {
        "aliases": ["customer name", "client name", "billed to", "buyer name", "customer", "client", "buyer", "recipient", "patient name", "candidate name", "employee name"],
        "type": "string"
    },
    "customer_gstin": {
        "aliases": ["customer gstin", "customer gst", "buyer gstin", "gstin", "gst number", "gst no", "tin number"],
        "type": "string"
    },
    "seller_name": {
        "aliases": ["seller name", "vendor name", "merchant name", "supplier name", "merchant", "seller", "vendor", "company name", "lab name", "lab", "diagnostics", "organization"],
        "type": "string"
    },
    "total_amount": {
        "aliases": ["total amount", "final amount", "grand total", "net amount", "total pay", "amount payable", "total invoice value", "total", "amount", "cholesterol level"],
        "type": "currency"
    },
    "subtotal": {
        "aliases": ["subtotal", "sub total", "taxable value", "taxable amount"],
        "type": "currency"
    },
    "cgst": {
        "aliases": ["cgst", "cgst amount"],
        "type": "currency"
    },
    "sgst": {
        "aliases": ["sgst", "sgst amount"],
        "type": "currency"
    },
    "igst": {
        "aliases": ["igst", "igst amount"],
        "type": "currency"
    },
    "tax_amount": {
        "aliases": ["tax amount", "tax", "gst amount", "vat amount", "total tax"],
        "type": "currency"
    },
    "pan_number": {
        "aliases": ["pan number", "pan", "pan no"],
        "type": "string"
    },
    "email": {
        "aliases": ["customer email", "email address", "email", "contact mail", "contact email", "mail", "enquiry email", "email id"],
        "type": "string"
    },
    "website": {
        "aliases": ["website", "portal", "web address", "url", "portal link", "website link", "web link", "webpage", "web page"],
        "type": "string"
    },
    "place": {
        "aliases": ["place", "venue", "location", "institution location", "city"],
        "type": "string"
    },
    "event_name": {
        "aliases": ["event name", "event", "program name", "conference name", "fest name", "title", "name", "event title"],
        "type": "string"
    },
    "hsn_code": {
        "aliases": ["hsn code", "hsn", "sac code", "hsn/sac"],
        "type": "string"
    },
    "bank_name": {
        "aliases": ["bank name", "bank", "bank details"],
        "type": "string"
    },
    "account_number": {
        "aliases": ["account number", "account no", "acc no", "a/c no"],
        "type": "string"
    },
    "ifsc_code": {
        "aliases": ["ifsc code", "ifsc", "ifsc code:"],
        "type": "string"
    },
    "po_number": {
        "aliases": ["po number", "purchase order number", "po no", "order number"],
        "type": "string"
    },
    "address": {
        "aliases": ["customer address", "billing address", "shipping address", "address", "location"],
        "type": "string"
    },
    "employee_id": {
        "aliases": ["employee id", "emp id", "staff id"],
        "type": "string"
    },
    "certificate_number": {
        "aliases": ["certificate number", "cert no", "certificate id"],
        "type": "string"
    },
    "designation": {
        "aliases": ["designation", "role", "job title", "position"],
        "type": "string"
    }
}

NESTED_LIST_KEYWORDS = [
    "products", "items", "line items", "ordered items", "articles", "goods", "services"
]

class RequestParser(BaseRequestParser):
    """Natural Language Request Parser that converts user request strings into normalized target field intents."""

    def parse(self, request_text: str) -> ParsedRequest:
        if not request_text or not request_text.strip():
            raise RequestParsingError("User request string cannot be empty.")

        clean_req = request_text.strip()
        logger.info(f"Parsing natural language request of length {len(clean_req)}")

        nested_fields, is_nested = self._extract_nested_list_fields(clean_req)
        requested_fields: List[FieldDefinition] = []
        
        nested_sub_keys = set()
        if is_nested and nested_fields:
            list_key = "products" if "product" in clean_req.lower() else ("items" if "item" in clean_req.lower() else "line_items")
            requested_fields.append(
                FieldDefinition(
                    key=list_key,
                    display_name=list_key.replace("_", " ").title(),
                    data_type="array",
                    is_list=True,
                    nested_fields=nested_fields,
                    aliases=[list_key, "items", "products", "line items"]
                )
            )
            for nf in nested_fields:
                nested_sub_keys.add(nf.key)

        scalar_fields = self._extract_scalar_fields(clean_req)
        for field_key, display_name, data_type, aliases in scalar_fields:
            if field_key in nested_sub_keys:
                continue
            if not any(f.key == field_key for f in requested_fields):
                requested_fields.append(
                    FieldDefinition(
                        key=field_key,
                        display_name=display_name,
                        data_type=data_type,
                        is_list=False,
                        aliases=aliases
                    )
                )

        if not requested_fields:
            fallback_fields = self._parse_fallback_phrases(clean_req)
            requested_fields.extend(fallback_fields)
        else:
            snake_tokens = re.findall(r'\b[a-z0-9]+_[a-z0-9_]+\b', clean_req.lower())
            for st in snake_tokens:
                if not any(f.key == st for f in requested_fields):
                    requested_fields.append(FieldDefinition(
                        key=st,
                        display_name=st.replace("_", " ").title(),
                        data_type="string",
                        is_list=False,
                        aliases=[st, st.replace("_", " ")]
                    ))

        if not requested_fields:
            raise RequestParsingError(f"Could not extract any target field requirements from request: '{request_text}'")

        return ParsedRequest(
            requested_fields=requested_fields,
            raw_request=clean_req
        )

    def _extract_nested_list_fields(self, text: str) -> Tuple[List[FieldDefinition], bool]:
        lower = text.lower()
        has_list = any(re.search(r'\b' + re.escape(kw) + r'\b', lower) for kw in NESTED_LIST_KEYWORDS)
        if not has_list:
            return [], False

        nested: List[FieldDefinition] = []
        # Check sub-attributes requested
        if any(w in lower for w in ["name", "product", "item", "description"]):
            nested.append(FieldDefinition(key="name", display_name="Item Name", data_type="string", aliases=["name", "description", "item"]))
        if any(w in lower for w in ["hsn", "hsn code", "code"]):
            nested.append(FieldDefinition(key="hsn_code", display_name="HSN Code", data_type="string", aliases=["hsn code", "hsn"]))
        if any(w in lower for w in ["quantity", "qty", "count"]):
            nested.append(FieldDefinition(key="quantity", display_name="Quantity", data_type="number", aliases=["quantity", "qty", "count"]))
        if any(w in lower for w in ["price", "rate", "unit price", "cost"]):
            nested.append(FieldDefinition(key="unit_price", display_name="Unit Price", data_type="string", aliases=["price", "unit price", "rate"]))
        if any(w in lower for w in ["amount", "total"]):
            nested.append(FieldDefinition(key="amount", display_name="Amount", data_type="string", aliases=["amount", "total amount"]))

        if not nested or (len(nested) == 1 and nested[0].key == "name" and not any(w in lower for w in ["only name", "just name", "item name only"])):
            # Default standard line item schema
            nested = [
                FieldDefinition(key="name", display_name="Item Name", data_type="string", aliases=["description", "name"]),
                FieldDefinition(key="quantity", display_name="Quantity", data_type="number", aliases=["quantity", "qty"]),
                FieldDefinition(key="unit_price", display_name="Unit Price", data_type="string", aliases=["unit price", "price"]),
                FieldDefinition(key="amount", display_name="Amount", data_type="string", aliases=["amount"])
            ]

        return nested, True

    def _extract_scalar_fields(self, text: str) -> List[Tuple[str, str, str, List[str]]]:
        lower = text.lower()
        spans_matched: List[Tuple[Tuple[int, int], str, str, str, List[str]]] = []

        for key, info in KNOWN_SYNONYMS.items():
            for alias in info["aliases"]:
                pattern = r'\b' + re.escape(alias) + r'\b'
                for m in re.finditer(pattern, lower):
                    display_name = key.replace("_", " ").title()
                    spans_matched.append((m.span(), key, display_name, info["type"], info["aliases"]))

        spans_matched.sort(key=lambda x: x[0][1] - x[0][0], reverse=True)
        selected_matched: List[Tuple[str, str, str, List[str]]] = []
        covered_indices = set()
        
        for (start, end), key, display_name, dtype, aliases in spans_matched:
            if any(i in covered_indices for i in range(start, end)):
                continue
            if not any(m[0] == key for m in selected_matched):
                selected_matched.append((key, display_name, dtype, aliases))
                for i in range(start, end):
                    covered_indices.add(i)

        return selected_matched

    def _parse_fallback_phrases(self, text: str) -> List[FieldDefinition]:
        clean = re.sub(r'^(i need|extract|give me|get|find|show me|what is|give me only|extract only)\s+', '', text, flags=re.IGNORECASE)
        clean = re.sub(r'\b(the|a|an|all|and|with|their|information|details|only|give|me|extract|find|show)\b', '', clean, flags=re.IGNORECASE)
        
        tokens = [t.strip() for t in re.split(r'[,.\n;]', clean) if t.strip()]
        result = []
        for tok in tokens:
            key = re.sub(r'[^a-zA-Z0-9_]', '_', tok.lower()).strip('_')
            key = re.sub(r'_+', '_', key)
            if key and len(key) > 2 and key not in ["only", "the", "and", "info"]:
                result.append(FieldDefinition(
                    key=key,
                    display_name=tok.title(),
                    data_type="string",
                    is_list=False,
                    aliases=[tok.lower(), key.replace("_", " ")]
                ))
        return result
