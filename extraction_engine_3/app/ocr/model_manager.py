import os
import threading
from typing import Optional, Any
from app.core.config import settings
from app.core.logging_config import logger

class ModelManager:
    """
    Singleton Manager for OCR model lifecycle.
    Initializes PaddleOCR instance ONCE and reuses it across multiple pages & API requests.
    Prevents memory leaks and heavy per-request re-initialization overhead.
    """
    _instance = None
    _lock = threading.Lock()
    _paddle_engine = None
    _is_mock = False

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(ModelManager, cls).__new__(cls)
        return cls._instance

    def get_paddle_engine(self) -> Any:
        """
        Returns initialized PaddleOCR engine instance.
        Lazy loads on first access. Thread-safe.
        """
        if self._paddle_engine is not None or self._is_mock:
            return self._paddle_engine

        with self._lock:
            if self._paddle_engine is not None:
                return self._paddle_engine

            try:
                # Set CPU flags to prevent oneDNN PIR static executor issues on Windows
                os.environ["FLAGS_enable_pir_api"] = "0"
                os.environ["FLAGS_enable_pir_in_executor"] = "0"

                from paddleocr import PaddleOCR
                logger.info("Initializing PaddleOCR model (CPU/GPU mode based on config)...")

                # Fast, lightweight PaddleOCR mobile initialization without heavy UVDoc/PP-LCNet unwarping
                self._paddle_engine = PaddleOCR(
                    ocr_version="PP-OCRv4",
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    lang="en",
                    enable_mkldnn=False
                )

                logger.info("PaddleOCR model initialized successfully.")
                self._is_mock = False
                return self._paddle_engine
            except Exception as e:
                logger.error(f"Failed to initialize PaddleOCR model: {e}")
                if settings.FALLBACK_TO_MOCK_IF_UNAVAILABLE:
                    logger.warning("Falling back to internal Text/OCR Extractor engine.")
                    self._is_mock = True
                    self._paddle_engine = None
                    return None
                else:
                    raise e

    def is_paddle_available(self) -> bool:
        """Returns True if native PaddleOCR engine is successfully initialized."""
        if self._paddle_engine is not None:
            return True
        try:
            eng = self.get_paddle_engine()
            return eng is not None
        except Exception:
            return False

    def is_mock_mode(self) -> bool:
        return self._is_mock


model_manager = ModelManager()
