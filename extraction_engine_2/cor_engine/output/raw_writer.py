"""Dedicated raw text artifact output writer with atomic file operations."""
import logging
import os
from pathlib import Path
import re
import uuid
from typing import Optional, Tuple, Union

from cor_engine.core.config import COR_OUTPUT_DIR
from cor_engine.core.exceptions import OutputWriteError, SecurityError

logger = logging.getLogger("cor_engine.output")


class RawTextWriter:
    """Handles atomic persistence of raw unstructured text artifacts."""

    def __init__(self, output_dir: Optional[Union[str, Path]] = None):
        self.output_dir = Path(output_dir).resolve() if output_dir else COR_OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_safe_doc_id(self, requested_id: Optional[str], source_path: Optional[Union[str, Path]] = None) -> str:
        """Sanitize or generate a safe unique document ID."""
        if requested_id:
            cleaned = str(requested_id).strip()
            if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
                raise SecurityError(f"Path traversal detected in document_id: '{requested_id}'")
            # Keep alphanumeric, underscores, hyphens, and periods
            cleaned = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", cleaned).lstrip(".")
            if cleaned:
                return cleaned

        if source_path:
            p = Path(source_path)
            stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", p.stem)
            if stem:
                return f"doc_{stem}"

        return f"doc_{uuid.uuid4().hex[:12]}"

    def write_artifact(
        self,
        document_id: str,
        text: str,
        encoding: str = "utf-8"
    ) -> Tuple[str, str]:
        """Atomically write unstructured raw text to <document_id>.txt in UTF-8.

        Returns:
            Tuple[str, str]: (raw_file_id, raw_file_path)
        """
        # Verify safe filename
        filename = f"{document_id}.txt"
        target_path = (self.output_dir / filename).resolve()

        # Guard against path traversal
        try:
            target_path.relative_to(self.output_dir)
        except ValueError:
            raise SecurityError(f"Target path '{target_path}' breaks out of output directory '{self.output_dir}'")

        # Atomic write: write temp -> flush -> fsync -> close -> rename
        temp_path = self.output_dir / f".{filename}.tmp_{os.getpid()}_{uuid.uuid4().hex[:8]}"

        try:
            with open(temp_path, "w", encoding=encoding, errors="replace") as f:
                f.write(text)
                f.flush()
                os.fsync(f.fileno())

            # Atomic replace
            temp_path.replace(target_path)
            logger.info("Successfully wrote raw artifact to %s", target_path)
            return filename, str(target_path)

        except Exception as exc:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            raise OutputWriteError(f"Failed to atomically write artifact '{target_path}': {str(exc)}") from exc
