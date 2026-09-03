"""Security utilities for safe path resolution, input validation, and atomic writes."""
import hashlib
import os
import re
from pathlib import Path
from typing import Optional, Union

from cor_engine.config import COR_OUTPUT_DIR, MAX_FILE_SIZE_BYTES
from cor_engine.exceptions import SecurityError


SAFE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def sanitize_document_id(doc_id: Optional[str], fallback_path: Optional[Union[str, Path]] = None) -> str:
    """Validate or generate a safe document identifier.

    Guards against path traversal, control characters, and reserved names.
    """
    if doc_id:
        doc_id = str(doc_id).strip()
        # Disallow directory separators and parent directory references
        if "/" in doc_id or "\\" in doc_id or ".." in doc_id:
            raise SecurityError(f"Invalid document_id containing path traversal: {doc_id}")
        
        # Replace spaces with underscores and remove disallowed chars
        cleaned = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", doc_id)
        if cleaned.startswith("."):
            cleaned = "doc_" + cleaned.lstrip(".")
        if cleaned:
            return cleaned

    # Generate stable fallback ID based on filename or hash
    if fallback_path:
        p = Path(fallback_path)
        stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", p.stem)
        if stem:
            return f"doc_{stem}"
    
    # Generic fallback
    import uuid
    return f"doc_{uuid.uuid4().hex[:12]}"


def resolve_safe_output_path(document_id: str, output_dir: Optional[Path] = None) -> Path:
    """Resolve and verify that the output .txt file path resides safely within output_dir."""
    target_dir = (output_dir or COR_OUTPUT_DIR).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{document_id}.txt"
    resolved_path = (target_dir / filename).resolve()

    # Verify no path traversal broke out of target_dir
    try:
        resolved_path.relative_to(target_dir)
    except ValueError:
        raise SecurityError(f"Path traversal detected for output file: {filename}")

    return resolved_path


def validate_input_file(file_path: Union[str, Path]) -> Path:
    """Validate file existence, read permissions, and size limits."""
    path = Path(file_path).resolve()
    if not path.is_file():
        from cor_engine.exceptions import MissingFileError
        raise MissingFileError(f"Document file does not exist: {path}")

    file_size = path.stat().st_size
    if file_size > MAX_FILE_SIZE_BYTES:
        raise SecurityError(f"File size exceeds limit ({file_size} bytes > {MAX_FILE_SIZE_BYTES} bytes)")

    return path


def atomic_write_text(file_path: Path, text: str, encoding: str = "utf-8") -> None:
    """Safely write text to file atomically to avoid partial file reads."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_suffix(file_path.suffix + f".tmp_{os.getpid()}")
    try:
        with open(temp_path, "w", encoding=encoding, errors="replace") as f:
            f.write(text)
        # Atomic replace
        temp_path.replace(file_path)
    except Exception:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise
