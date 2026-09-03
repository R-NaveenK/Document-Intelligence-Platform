import os
import shutil
import uuid
import tempfile
from pathlib import Path
from typing import Union, Optional, Tuple, BinaryIO
from app.core.config import settings
from app.core.exceptions import InvalidInputError, UnsupportedFileError
from app.core.logging_config import logger
from app.input.file_detector import FileDetector


class InputHandler:
    """
    Handles file upload ingestion, safe temporary file creation, 
    path traversal validation, and size checks.
    """

    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or settings.TEMP_DIR
        os.makedirs(self.temp_dir, exist_ok=True)

    def process_input(
        self,
        document: Union[str, Path, bytes, BinaryIO],
        original_filename: Optional[str] = None
    ) -> Tuple[str, str, str, bool]:
        """
        Ingests document input and saves it safely into a working file.
        
        Args:
            document: Path string, Path object, raw bytes, or file-like object.
            original_filename: Optional original filename.
            
        Returns:
            Tuple of (working_file_path, mime_type, extension, is_temp_file)
        """
        is_temp = False
        working_path = None

        if isinstance(document, (str, Path)):
            file_path_str = str(document)
            self._validate_path_traversal(file_path_str)
            if not os.path.exists(file_path_str):
                raise InvalidInputError(f"Specified document path does not exist: {file_path_str}")
            
            file_size = os.path.getsize(file_path_str)
            if file_size == 0:
                raise InvalidInputError("Provided file is empty (0 bytes).")
            if file_size > settings.MAX_FILE_SIZE_BYTES:
                raise InvalidInputError(
                    f"File size ({file_size} bytes) exceeds limit ({settings.MAX_FILE_SIZE_BYTES} bytes)."
                )
            
            working_path = file_path_str
            fname = original_filename or os.path.basename(file_path_str)

        elif isinstance(document, bytes):
            if len(document) == 0:
                raise InvalidInputError("Provided bytes payload is empty (0 bytes).")
            if len(document) > settings.MAX_FILE_SIZE_BYTES:
                raise InvalidInputError(
                    f"Payload size ({len(document)} bytes) exceeds limit ({settings.MAX_FILE_SIZE_BYTES} bytes)."
                )

            fname = original_filename or "upload.bin"
            ext_part = os.path.splitext(fname)[1] or ".bin"
            temp_filename = f"input_{uuid.uuid4().hex}{ext_part}"
            working_path = os.path.join(self.temp_dir, temp_filename)
            
            with open(working_path, "wb") as f:
                f.write(document)
            is_temp = True

        elif hasattr(document, "read"):
            # File-like object
            fname = original_filename or getattr(document, "name", "upload.bin")
            ext_part = os.path.splitext(fname)[1] or ".bin"
            temp_filename = f"input_{uuid.uuid4().hex}{ext_part}"
            working_path = os.path.join(self.temp_dir, temp_filename)

            with open(working_path, "wb") as out_f:
                shutil.copyfileobj(document, out_f)
            
            is_temp = True
            file_size = os.path.getsize(working_path)
            if file_size == 0:
                self.cleanup(working_path)
                raise InvalidInputError("Provided file stream is empty (0 bytes).")
            if file_size > settings.MAX_FILE_SIZE_BYTES:
                self.cleanup(working_path)
                raise InvalidInputError(
                    f"File size ({file_size} bytes) exceeds limit ({settings.MAX_FILE_SIZE_BYTES} bytes)."
                )
        else:
            raise InvalidInputError(f"Unsupported document input type: {type(document)}")

        # Detect MIME type and extension
        try:
            mime_type, extension = FileDetector.detect_file_type(working_path, fname)
        except Exception as e:
            if is_temp:
                self.cleanup(working_path)
            raise e

        # Validate against allowed extensions
        if extension not in settings.ALLOWED_EXTENSIONS and extension != "bin":
            if is_temp:
                self.cleanup(working_path)
            raise UnsupportedFileError(
                f"File format '{extension}' is not supported. Allowed formats: {settings.ALLOWED_EXTENSIONS}"
            )

        return working_path, mime_type, extension, is_temp

    def cleanup(self, file_path: str):
        """Safely delete temporary working file."""
        try:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup temporary file {file_path}: {e}")

    def _validate_path_traversal(self, path_str: str):
        """Check for path traversal attacks."""
        resolved = os.path.abspath(path_str)
        # Verify no suspicious control chars or null bytes
        if "\x00" in path_str:
            raise InvalidInputError("Invalid characters in file path.")
