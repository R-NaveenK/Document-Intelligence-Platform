import os
import json
import re
from pathlib import Path
from typing import Optional, Union, Dict, Any, List

from app.core.config import settings
from app.core.logging_config import logger
from app.core.exceptions import (
    RawArtifactNotFoundError,
    RawArtifactReadError,
    EmptyRawArtifactError,
    OversizedDocumentError,
    SecurityPathTraversalError,
    InvalidDocumentIdError
)
from app.models.extraction_input import RawExtractionInput, PageInput

class RawDocumentLoader:
    """
    Dedicated component responsible for securely resolving, validating, 
    and loading persisted raw extraction artifacts from disk.
    
    Adheres strictly to the architectural boundary:
    - Resolves artifact location in trusted storage
    - Enforces path-traversal and file-access security
    - Handles UTF-8 decoding and safe size limits
    - Constructs RawExtractionInput without modifying text or interpreting semantic meaning
    """

    def __init__(self, base_dir: Optional[Union[str, Path]] = None):
        if base_dir:
            self.base_dir = Path(base_dir).resolve()
        else:
            # Default to project root / data / raw_extraction
            proj_root = Path(__file__).resolve().parent.parent.parent
            self.base_dir = (proj_root / settings.RAW_EXTRACTION_DIR).resolve()

        # Fallback directory (e.g. sample_data for testing/fixtures)
        self.sample_dir = (Path(__file__).resolve().parent.parent.parent / "sample_data").resolve()

        # Ensure base directory exists
        self.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"RawDocumentLoader initialized with trusted storage dir: {self.base_dir}")

    def load(
        self,
        document_id: Optional[str] = None,
        artifact_path: Optional[str] = None
    ) -> RawExtractionInput:
        """
        Loads and returns a RawExtractionInput from a persisted extraction file.
        """
        if not document_id and not artifact_path:
            raise InvalidDocumentIdError("Either document_id or artifact_path must be provided.")

        target_file = self._resolve_secure_path(document_id, artifact_path)
        return self._read_artifact_file(target_file, document_id)

    def exists(self, document_id: Optional[str] = None, artifact_path: Optional[str] = None) -> bool:
        """Checks if a document artifact exists without raising exceptions."""
        try:
            target = self._resolve_secure_path(document_id, artifact_path)
            return target.is_file()
        except Exception:
            return False

    def _resolve_secure_path(self, document_id: Optional[str], artifact_path: Optional[str]) -> Path:
        """
        Resolves the file path while strictly guarding against path traversal attacks.
        """
        # 1. Security Check: Disallow null bytes and control chars
        ref = artifact_path if artifact_path else document_id
        if not ref or "\x00" in ref or "\r" in ref or "\n" in ref:
            raise SecurityPathTraversalError("Security violation: Path contains invalid or null control characters.")

        # 2. Check for explicit path traversal patterns
        traversal_patterns = [r'\.\./', r'\.\.\\', r'^\.\.$', r'^\.\.$']
        for p in traversal_patterns:
            if re.search(p, ref):
                raise SecurityPathTraversalError(f"Security violation: Path traversal detected in '{ref}'.")

        # 3. If explicit artifact_path is provided
        if artifact_path:
            p = Path(artifact_path)
            if p.is_absolute():
                candidate = p.resolve()
            else:
                candidate = (self.base_dir / p).resolve()

            # Ensure candidate is within base_dir, sample_dir, or is an existing explicit file
            if not self._is_path_allowed(candidate, is_explicit_file=True):
                raise SecurityPathTraversalError(
                    f"Access denied: Path '{artifact_path}' is outside trusted artifact directories."
                )

            if not candidate.is_file():
                raise RawArtifactNotFoundError(
                    f"Raw extraction artifact not found at '{artifact_path}'",
                    details={"artifact_path": artifact_path}
                )
            return candidate

        # 4. Resolve via document_id across search directories
        doc_id = str(document_id).strip()

        # Pure document IDs should not contain path delimiters
        if "/" in doc_id or "\\" in doc_id:
            raise InvalidDocumentIdError(
                f"Invalid document_id '{doc_id}'. Document IDs must not contain path separators. Use artifact_path instead."
            )

        search_dirs = [self.base_dir, self.sample_dir]
        for s_dir in search_dirs:
            if not s_dir.exists():
                continue
            candidates = [
                s_dir / f"{doc_id}.txt",
                s_dir / f"{doc_id}.json",
                s_dir / doc_id
            ]
            for cand in candidates:
                if cand.is_file():
                    # Double check containment
                    if not self._is_path_allowed(cand.resolve()):
                        raise SecurityPathTraversalError("Security violation: Path resolved outside trusted directory.")
                    return cand.resolve()

        # If not found in any search directory
        raise RawArtifactNotFoundError(
            f"Raw extraction artifact was not found for document_id '{doc_id}'.",
            details={"document_id": doc_id, "searched_dir": str(self.base_dir)}
        )

    def _is_path_allowed(self, path: Path, is_explicit_file: bool = False) -> bool:
        """Verifies canonical path is strictly contained within trusted storage trees or is an existing explicit file."""
        try:
            c = path.resolve()
            in_base = c.is_relative_to(self.base_dir.resolve())
            in_sample = c.is_relative_to(self.sample_dir.resolve())
            if in_base or in_sample:
                return True
            if is_explicit_file and c.is_file():
                return True
            return False
        except (ValueError, AttributeError):
            # Fallback for older python or cross-drive references on Windows
            c_str = str(path.resolve()).lower()
            return c_str.startswith(str(self.base_dir.resolve()).lower()) or c_str.startswith(str(self.sample_dir.resolve()).lower())

    def _read_artifact_file(self, file_path: Path, document_id: Optional[str]) -> RawExtractionInput:
        """
        Reads the artifact file, validates size and UTF-8 encoding, and parses into RawExtractionInput.
        """
        # Check size before reading into memory
        try:
            file_size = os.path.getsize(file_path)
        except OSError as e:
            raise RawArtifactReadError(f"Failed to access artifact file '{file_path.name}': {e}")

        if file_size > settings.MAX_TEXT_LENGTH_BYTES:
            mb_size = file_size / (1024 * 1024)
            limit_mb = settings.MAX_TEXT_LENGTH_BYTES / (1024 * 1024)
            raise OversizedDocumentError(
                f"Raw artifact '{file_path.name}' size ({mb_size:.2f} MB) exceeds limit ({limit_mb:.2f} MB).",
                details={"file_size_bytes": file_size, "limit_bytes": settings.MAX_TEXT_LENGTH_BYTES}
            )

        # Read UTF-8 content
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            # Fallback to UTF-8-sig for BOM or report clear encoding error
            try:
                with open(file_path, "r", encoding="utf-8-sig") as f:
                    content = f.read()
            except Exception as e:
                raise RawArtifactReadError(
                    f"File '{file_path.name}' has invalid encoding. Expected UTF-8: {e}",
                    details={"path": str(file_path)}
                )
        except PermissionError as e:
            raise RawArtifactReadError(f"Permission denied reading '{file_path.name}': {e}")
        except Exception as e:
            raise RawArtifactReadError(f"Error reading artifact file '{file_path.name}': {e}")

        # Check empty content
        if not content or not content.strip():
            raise EmptyRawArtifactError(
                f"Raw extraction artifact '{file_path.name}' is empty.",
                details={"path": str(file_path)}
            )

        # Parse JSON format if applicable
        if file_path.suffix.lower() == ".json" or (content.strip().startswith("{") and content.strip().endswith("}")):
            try:
                data = json.loads(content)
                if isinstance(data, dict):
                    raw_text = data.get("raw_text", "")
                    if not raw_text and "text" in data:
                        raw_text = data.get("text", "")

                    pages_data = data.get("pages", [])
                    parsed_pages = []
                    for p in pages_data:
                        if isinstance(p, dict):
                            parsed_pages.append(PageInput(**p))
                        elif isinstance(p, PageInput):
                            parsed_pages.append(p)

                    return RawExtractionInput(
                        document_id=data.get("document_id", document_id or file_path.stem),
                        raw_text=raw_text,
                        pages=parsed_pages,
                        extraction_confidence=data.get("extraction_confidence", 1.0),
                        metadata=data.get("metadata", {"source_file": file_path.name})
                    )
            except json.JSONDecodeError:
                # If JSON parsing fails, treat as raw text
                pass

        # Parse plain text format (.txt)
        # Check for standard page break markers to retain page structure
        pages = []
        page_splits = re.split(r'\[PAGE_BREAK\]|\f', content)
        if len(page_splits) > 1:
            for p_num, p_text in enumerate(page_splits, start=1):
                clean_pt = p_text.strip()
                if clean_pt:
                    pages.append(PageInput(
                        page_number=p_num,
                        raw_text=clean_pt,
                        confidence=1.0,
                        character_count=len(clean_pt),
                        word_count=len(clean_pt.split())
                    ))

        return RawExtractionInput(
            document_id=document_id or file_path.stem,
            raw_text=content,
            pages=pages,
            extraction_confidence=1.0,
            metadata={"source_file": file_path.name, "file_size_bytes": file_size}
        )
