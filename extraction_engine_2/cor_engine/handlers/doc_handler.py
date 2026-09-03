"""Legacy DOC document handler with converter check and safe stream fallback."""
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from cor_engine.core.exceptions import DocConversionError, DocProcessingError
from cor_engine.core.result import PageExtraction, RawExtraction
from cor_engine.handlers.base import BaseDocumentHandler

logger = logging.getLogger("cor_engine.doc")


class DocHandler(BaseDocumentHandler):
    """Handler for legacy Microsoft Word .doc binary files."""

    def __init__(self):
        self._converter_binary = self._find_converter()

    def _find_converter(self):
        for binary in ("soffice", "libreoffice", "antiword"):
            path = shutil.which(binary)
            if path:
                return path
        for p in (r"C:\Program Files\LibreOffice\program\soffice.exe", r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"):
            if os.path.exists(p):
                return p
        return None

    def _convert_with_libreoffice(self, file_path: Path) -> str:
        with tempfile.TemporaryDirectory() as temp_dir:
            cmd = [
                self._converter_binary,
                "--headless",
                "--convert-to",
                "txt:Text",
                "--outdir",
                temp_dir,
                str(file_path),
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            if res.returncode != 0:
                raise DocProcessingError(f"LibreOffice conversion failed: {res.stderr.decode('utf-8', errors='ignore')}")

            expected_txt = Path(temp_dir) / f"{file_path.stem}.txt"
            if expected_txt.exists():
                return expected_txt.read_text(encoding="utf-8", errors="replace")
            raise DocProcessingError("LibreOffice did not produce output file.")

    def _convert_with_antiword(self, file_path: Path) -> str:
        res = subprocess.run([self._converter_binary, str(file_path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        if res.returncode != 0:
            raise DocProcessingError(f"Antiword failed: {res.stderr.decode('utf-8', errors='ignore')}")
        return res.stdout.decode("utf-8", errors="replace")

    def _extract_ole_stream_fallback(self, file_path: Path) -> str:
        try:
            with open(file_path, "rb") as f:
                content = f.read()

            extracted = []
            # UTF-16LE text run search
            utf16_pattern = re.compile(rb"(?:[\x20-\x7e\x0a\x0d]\x00){4,}")
            for m in utf16_pattern.finditer(content):
                try:
                    s = m.group(0).decode("utf-16le", errors="ignore").strip()
                    if len(s) >= 4 and not s.startswith("Normal."):
                        extracted.append(s)
                except Exception:
                    pass

            # ASCII text run search
            ascii_pattern = re.compile(rb"[\x20-\x7e\x0a\x0d]{6,}")
            for m in ascii_pattern.finditer(content):
                try:
                    s = m.group(0).decode("latin-1", errors="ignore").strip()
                    if len(s) >= 6 and not s.startswith("Microsoft Word") and not s.startswith("Word.Document") and s not in extracted:
                        extracted.append(s)
                except Exception:
                    pass

            if extracted:
                return "\n".join(extracted)
        except Exception as exc:
            logger.debug("OLE fallback failed: %s", exc)

        return ""

    def extract(self, file_path: Path) -> RawExtraction:
        if self._converter_binary:
            try:
                if "antiword" in self._converter_binary.lower():
                    text = self._convert_with_antiword(file_path)
                else:
                    text = self._convert_with_libreoffice(file_path)
                page = PageExtraction(page_number=1, text=text.strip() + "\n", is_ocr=False, confidence=1.0)
                return RawExtraction(pages=[page])
            except Exception as exc:
                logger.warning("Converter failed, attempting OLE stream fallback: %s", exc)

        recovered = self._extract_ole_stream_fallback(file_path)
        if recovered.strip():
            page = PageExtraction(page_number=1, text=recovered.strip() + "\n", is_ocr=False, confidence=1.0)
            return RawExtraction(pages=[page])

        raise DocConversionError(
            "Legacy DOC format requires LibreOffice/antiword installed in system PATH, "
            "and internal stream extractor found no readable text."
        )
