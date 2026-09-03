import re
from typing import List, Dict, Any
from models import PageInputModel, PageClassification

def detect_page_boundaries(
    page_classifications: List[Dict[str, Any]],
    raw_pages: List[PageInputModel]
) -> List[str]:
    """
    Determines boundary type for each page: STARTS_NEW_DOCUMENT, CONTINUES_PREVIOUS_DOCUMENT, or UNKNOWN_BOUNDARY.
    """
    boundaries: List[str] = []

    first_page_patterns = [
        r'\bpage\s+1\b',
        r'\bpage\s+1\s+of\b',
        r'\binvoice\s*#',
        r'\breceipt\s*#',
        r'\badmission\s+form\b',
        r'\bpurchase\s+order\s*#'
    ]

    for idx, pc in enumerate(page_classifications):
        if idx == 0:
            boundaries.append("STARTS_NEW_DOCUMENT")
            continue

        prev_pc = page_classifications[idx - 1]
        raw_text = (raw_pages[idx].text or "").lower() if idx < len(raw_pages) else ""

        # Signal 1: Document type change => STARTS_NEW_DOCUMENT
        if pc.get("documentTypeId") != prev_pc.get("documentTypeId"):
            boundaries.append("STARTS_NEW_DOCUMENT")
            continue

        # Signal 2: Same document type, but strong first page indicator text
        has_first_page_signal = any(re.search(pat, raw_text) for pat in first_page_patterns)
        if has_first_page_signal:
            boundaries.append("STARTS_NEW_DOCUMENT")
            continue

        # Signal 3: Unknown document type => UNKNOWN_BOUNDARY
        if not pc.get("documentTypeId"):
            boundaries.append("UNKNOWN_BOUNDARY")
            continue

        # Default continuation for same document type
        boundaries.append("CONTINUES_PREVIOUS_DOCUMENT")

    return boundaries
