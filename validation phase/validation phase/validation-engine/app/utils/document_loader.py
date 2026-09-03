import csv
import json
import re
from pathlib import Path
from typing import Any, Dict
import yaml

from app.models.document import BaseDocument


def parse_key_value_text(text: str) -> Dict[str, Any]:
    """Parses plain text / markdown key-value pairs like 'invoice_number: INV-1001'."""
    data: Dict[str, Any] = {}
    lines = text.strip().splitlines()
    for line in lines:
        if ":" in line and not line.strip().startswith("#"):
            k, v = line.split(":", 1)
            key = k.strip().lower().replace(" ", "_")
            val_str = v.strip()

            # Attempt numeric conversion
            try:
                if "." in val_str:
                    val = float(val_str)
                else:
                    val = int(val_str)
            except ValueError:
                val = val_str

            data[key] = val
    return data


def load_pdf_file(file_path: Path) -> Dict[str, Any]:
    """Extracts structured key-value data from PDF text using pypdf."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(file_path))
        full_text = "\n".join([page.extract_text() or "" for page in reader.pages])
    except Exception:
        # Fallback if pypdf fails or unreadable
        full_text = file_path.read_text(encoding="utf-8", errors="ignore")

    data = parse_key_value_text(full_text)

    # Common regex extractors for PDF text
    doc_id_match = re.search(r"Invoice\s*(?:No|Number|ID)?\s*[:#-]?\s*([A-Za-z0-9-]+)", full_text, re.IGNORECASE)
    if doc_id_match and "invoice_number" not in data:
        data["invoice_number"] = doc_id_match.group(1)
        data["document_id"] = doc_id_match.group(1)

    date_match = re.search(r"Date\s*[:#-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-\d{2}-\d{4})", full_text, re.IGNORECASE)
    if date_match and "invoice_date" not in data:
        data["invoice_date"] = date_match.group(1)

    gst_match = re.search(r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b", full_text)
    if gst_match and "gst_number" not in data:
        data["gst_number"] = gst_match.group(1)

    total_match = re.search(r"Total\s*(?:Amount)?\s*[:#-]?\s*₹?\s*([\d,]+(?:\.\d+)?)", full_text, re.IGNORECASE)
    if total_match and "total_amount" not in data:
        try:
            data["total_amount"] = float(total_match.group(1).replace(",", ""))
        except ValueError:
            pass

    return data


def load_excel_file(file_path: Path) -> Dict[str, Any]:
    """Extracts structured key-value data from Excel .xlsx / .xls file."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(str(file_path), data_only=True)
        sheet = wb.active
        data: Dict[str, Any] = {}

        for row in sheet.iter_rows(values_only=True):
            if len(row) >= 2 and row[0] is not None:
                k = str(row[0]).strip().lower().replace(" ", "_")
                v = row[1]
                data[k] = v

        if data:
            return data
    except Exception:
        pass

    return {}


def load_csv_file(file_path: Path) -> Dict[str, Any]:
    """Extracts structured data from CSV file."""
    data: Dict[str, Any] = {}
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) >= 2:
                k = row[0].strip().lower().replace(" ", "_")
                v = row[1].strip()
                try:
                    v_num = float(v) if "." in v else int(v)
                    data[k] = v_num
                except ValueError:
                    data[k] = v
    return data


def load_document_from_file(file_path: Path) -> BaseDocument:
    """
    Multi-Format Document Ingestion Engine.
    Supports JSON, YAML, CSV, XLSX, PDF, TXT, MD.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")

    ext = file_path.suffix.lower()

    if ext == ".json":
        with open(file_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

    elif ext in (".yaml", ".yml"):
        with open(file_path, "r", encoding="utf-8") as f:
            raw_data = yaml.safe_load(f) or {}

    elif ext in (".xlsx", ".xls"):
        raw_data = load_excel_file(file_path)

    elif ext == ".csv":
        raw_data = load_csv_file(file_path)

    elif ext == ".pdf":
        raw_data = load_pdf_file(file_path)

    elif ext in (".txt", ".md"):
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        raw_data = parse_key_value_text(text)

    else:
        # Fallback text reading
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        raw_data = parse_key_value_text(text)

    doc_id = (
        raw_data.get("document_id")
        or raw_data.get("invoice_number")
        or file_path.stem.upper()
    )
    doc_type = raw_data.get("document_type", "invoice")

    return BaseDocument(
        document_id=str(doc_id),
        document_type=str(doc_type),
        raw_data=raw_data,
    )
