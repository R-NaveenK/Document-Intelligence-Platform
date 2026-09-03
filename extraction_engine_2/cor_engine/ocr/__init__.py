"""OCR package wrapping PaddleOCR engine and image preprocessing."""
from cor_engine.ocr.paddle_engine import PaddleOCREngine
from cor_engine.ocr.preprocessing import preprocess_image, validate_image_input

__all__ = ["PaddleOCREngine", "preprocess_image", "validate_image_input"]
