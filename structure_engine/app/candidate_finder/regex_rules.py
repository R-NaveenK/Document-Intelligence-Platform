import re
from typing import Dict, List, Pattern

DETERMINISTIC_PATTERNS: Dict[str, List[Pattern]] = {
    "gstin": [
        re.compile(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', re.IGNORECASE),
    ],
    "pan_number": [
        re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', re.IGNORECASE),
    ],
    "invoice_date": [
        re.compile(r'\b\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}\b'),
        re.compile(r'\b\d{2,4}[-/\.]\d{1,2}[-/\.]\d{1,2}\b'),
        re.compile(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b', re.IGNORECASE),
        re.compile(r'\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b', re.IGNORECASE)
    ],
    "invoice_number": [
        re.compile(r'\b(?:[il1]nvoice|inv|[b8]ill|[b8]1ll|bill|receipt|doc|facture|num[ée]ro\s+de\s+facture)\s*(?:no\.?|n[0o]\.?|number|num\.?|#)?\s*[:#]\s*([A-Z0-9\-/]{3,30})\b', re.IGNORECASE),
        re.compile(r'\b[A-Z]{2,5}/[A-Z0-9\-/]{5,25}\b')
    ],
    "total_amount": [
        re.compile(r'\b(?:Total\s*TTC|Total\s*[il1]nvoice\s*Amount|Grand\s*Total|Gr4nd\s*T0t4l|Net\s*Amount|Amount\s*Payable|Total\s*Amount|Final\s*Amount|Final\s*Settlement\s*Value)\b[:\s]*((?:Rs\.?|INR|[₹\$€£])?\s*[0-9,]+(?:\.[0-9]{2})?)', re.IGNORECASE),
        re.compile(r'((?:Rs\.?|INR|[₹\$€£])\s*[0-9,]+(?:\.[0-9]{2})?)')
    ],
    "phone": [
        re.compile(r'\b(?:\+?\d{1,3}[\s\-])?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b')
    ],
    "email": [
        re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    ],
    "website": [
        re.compile(r'https?://[a-zA-Z0-9.\-_/]+')
    ],
    "place": [
        re.compile(r'(?:entering|venue:?|at|location:?|held at)\s*([A-Za-z\s]+)', re.IGNORECASE)
    ],
    "event_name": [
        re.compile(r'(?:steps to use the|welcome to|event:?)\s*([A-Za-z0-9\ufffd\'\-]+(?:\s*[\ufffd\'’]?[0-9]{2,4})?)', re.IGNORECASE)
    ]
}
