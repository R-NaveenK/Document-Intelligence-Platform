"""Automatic file type detection based on magic bytes, zip structure, and extension."""
from enum import Enum
from pathlib import Path
from typing import Union
import zipfile

from cor_engine.core.exceptions import MissingFileError, UnsupportedFileTypeError


class DocumentType(str, Enum):
    PDF = "PDF"
    DOC = "DOC"
    DOCX = "DOCX"
    TXT = "TXT"
    JPG = "JPG"
    JPEG = "JPEG"
    PNG = "PNG"


MAGIC_SIGNATURES = [
    (b"%PDF-", DocumentType.PDF),
    (b"\x89PNG\r\n\x1a\n", DocumentType.PNG),
    (b"\xff\xd8\xff", DocumentType.JPEG),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", DocumentType.DOC),
]

EXTENSION_MAP = {
    ".pdf": DocumentType.PDF,
    ".docx": DocumentType.DOCX,
    ".doc": DocumentType.DOC,
    ".txt": DocumentType.TXT,
    ".png": DocumentType.PNG,
    ".jpg": DocumentType.JPG,
    ".jpeg": DocumentType.JPEG,
}


class FileTypeDetector:
    """Detects input file type accurately and automatically."""

    @staticmethod
    def detect(file_path: Union[str, Path]) -> DocumentType:
        path = Path(file_path).resolve()
        if not path.is_file():
            raise MissingFileError(f"Input file not found: {path}")

        ext = path.suffix.lower()

        # Read magic bytes
        header = b""
        try:
            with open(path, "rb") as f:
                header = f.read(32)
        except Exception as exc:
            raise UnsupportedFileTypeError(f"Failed to read file header: {str(exc)}") from exc

        # Match magic bytes
        for sig, doc_type in MAGIC_SIGNATURES:
            if header.startswith(sig):
                if doc_type == DocumentType.JPEG and ext == ".jpg":
                    return DocumentType.JPG
                return doc_type

        # Check for DOCX (ZIP archive containing word/)
        if header.startswith(b"PK\x03\x04") or header.startswith(b"PK\x05\x06"):
            if ext == ".docx":
                return DocumentType.DOCX
            try:
                with zipfile.ZipFile(path, "r") as zf:
                    if any(name.startswith("word/") for name in zf.namelist()):
                        return DocumentType.DOCX
            except Exception:
                pass

        # Extension fallback
        if ext in EXTENSION_MAP:
            return EXTENSION_MAP[ext]

        # Plain text fallback
        try:
            with open(path, "r", encoding="utf-8") as f:
                f.read(1024)
            if ext in ("", ".log", ".text"):
                return DocumentType.TXT
        except UnicodeDecodeError:
            pass

        raise UnsupportedFileTypeError(f"Unsupported file format: '{path.name}' (extension: '{ext}')")
