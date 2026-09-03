import json
import requests
from typing import List, Dict, Optional, Tuple
from models import DocumentTypeModel
from config import settings

def classify_with_gemini(page_text: str, doc_types: List[DocumentTypeModel]) -> Tuple[Optional[str], float, str]:
    """
    Structured Gemini AI fallback classifier.
    Returns: (matched_document_type_id, confidence, explanation_reason)
    """
    if not settings.GEMINI_ENABLED or not settings.GEMINI_API_KEY:
        return (None, 0.0, "Gemini AI classification disabled or API key missing.")

    if not page_text or not doc_types:
        return (None, 0.0, "Empty page text or empty allowed document types.")

    allowed_options = [
        {
            "documentTypeId": dt.documentTypeId,
            "name": dt.name,
            "key": dt.key,
            "description": dt.description,
            "aliases": dt.aliases
        }
        for dt in doc_types
    ]

    prompt = f"""
You are an expert document classification AI.
Classify the following page text into EXACTLY ONE of the allowed document types listed below.

ALLOWED DOCUMENT TYPES:
{json.dumps(allowed_options, indent=2)}

PAGE TEXT:
\"\"\"
{page_text[:1500]}
\"\"\"

CRITICAL RULES:
1. Respond ONLY with a valid JSON object matching this schema:
{{
  "documentTypeId": "<MUST be one of the documentTypeId strings above or UNKNOWN>",
  "confidence": <float between 0.0 and 1.0>,
  "reason": "<short factual explanation>"
}}
2. Do NOT invent a new documentTypeId. If none fit, use "UNKNOWN".
"""

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }

        res = requests.post(url, json=payload, timeout=5)
        if res.status_code == 200:
            data = res.json()
            raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(raw_text)

            dt_id = parsed.get("documentTypeId")
            conf = float(parsed.get("confidence", 0.0))
            reason = parsed.get("reason", "Gemini prediction")

            # Validate returned ID against allowed list
            valid_ids = [dt.documentTypeId for dt in doc_types]
            if dt_id in valid_ids:
                return (dt_id, min(conf, 1.0), reason)
            elif dt_id == "UNKNOWN":
                return (None, conf, "Gemini classified as UNKNOWN.")
            else:
                return (None, 0.0, f"Gemini returned invalid ID '{dt_id}'. Safe fallback triggered.")

    except Exception as e:
        return (None, 0.0, f"Gemini call exception: {str(e)}. Safe fallback triggered.")

    return (None, 0.0, "Gemini classification completed without match.")
