import os
import re
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from app.models.extraction_result import PageResult
from app.core.config import settings
from app.core.exceptions import InvalidDocumentIdError, StorageError
from app.core.logging_config import logger

# Regex for safe document ID: only alphanumeric characters, underscores, and hyphens
DOC_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")

# Windows reserved device names that cannot be used as filenames
RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
}


def validate_document_id(document_id: Optional[str]) -> str:
    """
    Validates document_id to prevent path traversal, unsafe filenames, and illegal characters.
    
    Args:
        document_id: The document tracking identifier to validate.
        
    Returns:
        Cleaned valid document_id.
        
    Raises:
        InvalidDocumentIdError: If document_id contains invalid characters, path traversal,
                                or reserved filenames.
    """
    if not document_id or not isinstance(document_id, str):
        raise InvalidDocumentIdError("Document ID must be a non-empty string.")

    cleaned_id = document_id.strip()

    if not cleaned_id:
        raise InvalidDocumentIdError("Document ID cannot be empty or whitespace.")

    # Guard against path traversal sequences
    if ".." in cleaned_id or "/" in cleaned_id or "\\" in cleaned_id or "\0" in cleaned_id:
        raise InvalidDocumentIdError(
            f"Invalid document_id '{document_id}': Contains path traversal or directory separator characters."
        )

    # Validate allowed characters
    if not DOC_ID_PATTERN.match(cleaned_id):
        raise InvalidDocumentIdError(
            f"Invalid document_id '{document_id}': Only alphanumeric characters, hyphens, and underscores are allowed."
        )

    # Check for Windows reserved names
    if cleaned_id.upper() in RESERVED_NAMES:
        raise InvalidDocumentIdError(
            f"Invalid document_id '{document_id}': Uses a reserved system device name."
        )

    if len(cleaned_id) > 128:
        raise InvalidDocumentIdError(
            f"Invalid document_id length ({len(cleaned_id)}). Maximum length allowed is 128 characters."
        )

    return cleaned_id


def generate_document_id(original_filename: Optional[str] = None) -> str:
    """
    Generates a safe, unique, and stable document identifier.
    
    Format:
        doc_YYYYMMDD_HHMMSS_<short_uuid>
        e.g. doc_20260903_003500_a1b2c3d4
    """
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    rand_suffix = uuid.uuid4().hex[:8]
    return f"doc_{now_str}_{rand_suffix}"


def format_raw_text(page_results: List[PageResult], fallback_text: str = "") -> str:
    """
    Formats complete unstructured raw extraction content for file persistence.
    
    Rules:
    - If document contains multiple pages, preserves page boundaries using standard demarcation:
        ----------------------------------------
        PAGE 1
        ----------------------------------------

        [page 1 raw text]

        ----------------------------------------
        PAGE 2
        ----------------------------------------

        [page 2 raw text]
    - If document contains a single page, preserves raw page text directly.
    - If page_results is empty, uses fallback_text.
    - Preserves all detected textual/numerical content, UTF-8 symbols (₹, $, €, multilingual),
      labels, and reading order without any semantic structuring or data loss.
    """
    if not page_results:
        return fallback_text.strip()

    if len(page_results) == 1:
        return page_results[0].raw_text

    # Multi-page formatting
    page_blocks: List[str] = []
    for page in page_results:
        header = f"----------------------------------------\nPAGE {page.page_number}\n----------------------------------------"
        content = page.raw_text.strip()
        page_blocks.append(f"{header}\n\n{content}")

    return "\n\n".join(page_blocks)


def persist_raw_extraction(
    document_id: str,
    content: str,
    output_dir: Optional[str] = None
) -> Tuple[str, str]:
    """
    Persists complete raw unstructured extraction to an unstructured text file using atomic writes.
    
    Args:
        document_id: Validated document tracking ID.
        content: Complete unstructured raw text content to write.
        output_dir: Directory where the file should be saved (defaults to settings.RAW_EXTRACTION_DIR).
        
    Returns:
        Tuple of (raw_file_path, raw_file_id):
            - raw_file_path: Relative or normalized path to the saved text file (forward slashes).
            - raw_file_id: Logical filename identifier (e.g. '<document_id>.txt').
            
    Raises:
        StorageError: If disk creation, temporary file creation, write, or rename fails.
    """
    valid_id = validate_document_id(document_id)
    raw_file_id = f"{valid_id}.txt"

    target_dir_str = output_dir or settings.RAW_EXTRACTION_DIR
    target_dir = Path(target_dir_str).resolve()

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise StorageError(f"Failed to create raw extraction storage directory '{target_dir}': {e}")

    final_file_path = target_dir / raw_file_id
    temp_file_path: Optional[Path] = None

    try:
        # Atomic write pattern:
        # 1. Create temporary file in the same directory (guarantees same filesystem volume)
        # 2. Write full UTF-8 content
        # 3. Flush & sync file descriptor to physical storage
        # 4. Close
        # 5. Atomically replace temp file into final target location
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=str(target_dir),
            prefix=f".{valid_id}_",
            suffix=".tmp",
            delete=False
        ) as tmp:
            temp_file_path = Path(tmp.name)
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())

        # Atomic replace
        os.replace(temp_file_path, final_file_path)
        temp_file_path = None  # Replaced successfully

    except Exception as e:
        if temp_file_path and temp_file_path.exists():
            try:
                temp_file_path.unlink()
            except OSError:
                pass
        raise StorageError(f"Failed to persist raw extraction file for '{valid_id}': {e}")

    # Compute normalized relative path for output contract
    try:
        cwd = Path.cwd().resolve()
        relative_path = final_file_path.relative_to(cwd).as_posix()
    except ValueError:
        relative_path = final_file_path.as_posix()

    return relative_path, raw_file_id


def log_persistence_metadata(
    document_id: str,
    page_count: int,
    character_count: int,
    processing_time_ms: int,
    output_artifact: str,
    status: str
) -> None:
    """
    Logs metadata about the persisted artifact without exposing sensitive document content.
    """
    logger.info(
        f"Raw extraction artifact persisted | "
        f"document_id='{document_id}' | "
        f"pages={page_count} | "
        f"characters={character_count} | "
        f"processing_time_ms={processing_time_ms} | "
        f"artifact='{output_artifact}' | "
        f"status='{status}'"
    )
