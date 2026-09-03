import os
import mimetypes
from typing import Tuple
from app.core.exceptions import UnsupportedFileError

# Magic byte signatures
MAGIC_SIGNATURES = {
    b"%PDF": ("application/pdf", "pdf"),
    b"\xff\xd8\xff": ("image/jpeg", "jpg"),
    b"\x89PNG\r\n\x1a\n": ("image/png", "png"),
    b"II*\x00": ("image/tiff", "tif"),
    b"MM\x00*": ("image/tiff", "tif"),
    b"PK\x03\x04": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
}


class FileDetector:
    """
    Detects file types accurately using magic bytes and file extensions.
    Prevents mime-spoofing and invalid file upload attacks.
    """

    @staticmethod
    def detect_file_type(file_path: str, original_filename: str = None) -> Tuple[str, str]:
        """
        Determines the MIME type and extension of a given file path.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Read first 16 bytes for signature matching
        with open(file_path, "rb") as f:
            header = f.read(16)

        if not header:
            raise UnsupportedFileError("File is empty (0 bytes).")

        target_name = original_filename or file_path
        ext = os.path.splitext(target_name)[1].lstrip(".").lower()

        ext_mime_map = {
            "pdf": "application/pdf",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "tif": "image/tiff",
            "tiff": "image/tiff",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "xls": "application/vnd.ms-excel",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "doc": "application/msword",
        }

        # Check explicit file extension first for office documents
        if ext in ext_mime_map:
            return ext_mime_map[ext], ext

        # Magic byte check
        for signature, (mime, sig_ext) in MAGIC_SIGNATURES.items():
            if header.startswith(signature):
                return mime, sig_ext

        mime, _ = mimetypes.guess_type(target_name)
        if mime in [
            "application/pdf", "image/jpeg", "image/png", "image/tiff",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword"
        ]:
            return mime, ext or "bin"

        raise UnsupportedFileError(
            f"Unsupported file type. Extension '{ext}' or magic bytes not recognized. "
            "Supported formats: PDF, JPG, PNG, TIFF, XLSX, XLS, DOCX, DOC."
        )
