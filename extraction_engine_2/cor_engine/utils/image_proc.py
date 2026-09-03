"""Image preprocessing and validation utilities for OCR."""
import io
from pathlib import Path
from typing import Optional, Tuple, Union

import cv2
import numpy as np
from PIL import Image

from cor_engine.config import MAX_IMAGE_PIXELS
from cor_engine.exceptions import CorruptedDocumentError, SecurityError

# Set PIL decompression bomb limit
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def validate_and_load_image(image_input: Union[str, Path, bytes, np.ndarray, Image.Image]) -> np.ndarray:
    """Validate image integrity, guard against bombs, and return as uint8 BGR/RGB numpy array."""
    try:
        if isinstance(image_input, np.ndarray):
            img = image_input
            if img.size == 0:
                raise CorruptedDocumentError("Empty image numpy array")
            return img

        if isinstance(image_input, Image.Image):
            pil_img = image_input
        elif isinstance(image_input, bytes):
            if len(image_input) == 0:
                raise CorruptedDocumentError("Empty image byte stream")
            pil_img = Image.open(io.BytesIO(image_input))
        else:
            path = Path(image_input)
            if not path.exists():
                from cor_engine.exceptions import MissingFileError
                raise MissingFileError(f"Image file does not exist: {path}")
            if path.stat().st_size == 0:
                raise CorruptedDocumentError("Image file is empty (0 bytes)")
            pil_img = Image.open(path)

        # Verify image integrity
        pil_img.draft(None, None)
        width, height = pil_img.size
        if width * height > MAX_IMAGE_PIXELS:
            raise SecurityError(f"Image dimensions ({width}x{height}) exceed maximum allowed pixel limit")

        # Convert to RGB
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        arr = np.array(pil_img)
        return arr

    except SecurityError:
        raise
    except CorruptedDocumentError:
        raise
    except Exception as exc:
        raise CorruptedDocumentError(f"Failed to load image: {str(exc)}") from exc


def preprocess_image_for_ocr(
    image: np.ndarray,
    enhance_contrast: bool = True,
    max_side_len: int = 4000,
    min_side_len: int = 32
) -> np.ndarray:
    """Lightweight preprocessing to improve OCR accuracy without over-processing.

    Applies dimension scaling if outside boundaries and optional contrast enhancement.
    """
    h, w = image.shape[:2]
    if h < min_side_len or w < min_side_len:
        # Scale up tiny images
        scale = max(min_side_len / max(h, 1), min_side_len / max(w, 1)) * 2
        new_w, new_h = int(w * scale), int(h * scale)
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        h, w = image.shape[:2]

    if max(h, w) > max_side_len:
        # Downscale overly large images
        scale = max_side_len / float(max(h, w))
        new_w, new_h = int(w * scale), int(h * scale)
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    if enhance_contrast:
        # If image is grayscale or near-grayscale, apply mild CLAHE to brighten dark text
        if len(image.shape) == 2:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            image = clahe.apply(image)
        elif len(image.shape) == 3:
            # Convert to LAB, enhance L-channel, convert back to RGB
            lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
            l_enhanced = clahe.apply(l)
            merged = cv2.merge((l_enhanced, a, b))
            image = cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)

    return image
