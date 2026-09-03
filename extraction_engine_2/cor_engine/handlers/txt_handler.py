"""Plain text (TXT) document handler with multi-encoding fallback."""
from pathlib import Path

from cor_engine.core.exceptions import InvalidFileError
from cor_engine.core.result import PageExtraction, RawExtraction
from cor_engine.handlers.base import BaseDocumentHandler


class TxtHandler(BaseDocumentHandler):
    """Handler for plain text documents (.txt)."""

    ENCODINGS = ("utf-8", "utf-8-sig", "windows-1252", "latin-1", "utf-16")

    def extract(self, file_path: Path) -> RawExtraction:
        with open(file_path, "rb") as f:
            raw_bytes = f.read()

        if len(raw_bytes) == 0:
            raise InvalidFileError("Text file is empty (0 bytes)")

        content = None
        for enc in self.ENCODINGS:
            try:
                content = raw_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue

        if content is None:
            try:
                content = raw_bytes.decode("utf-8", errors="replace")
            except Exception as exc:
                raise InvalidFileError(f"Failed to decode TXT file: {str(exc)}") from exc

        page = PageExtraction(page_number=1, text=content.strip() + "\n", is_ocr=False, confidence=1.0)
        return RawExtraction(pages=[page])
