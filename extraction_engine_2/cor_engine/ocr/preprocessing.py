"""Configurable image preprocessing pipeline for PaddleOCR."""
import io
import logging
from pathlib import Path
from typing import Optional, Union

import cv2
import numpy as np
from PIL import Image

from cor_engine.core.config import (
    COR_CONTRAST_ENHANCEMENT,
    COR_DENOISE,
    COR_PREPROCESSING_ENABLED,
    MAX_IMAGE_PIXELS,
)
from cor_engine.core.exceptions import InvalidFileError, SecurityError

logger = logging.getLogger("cor_engine.ocr.preprocessing")

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def validate_image_input(image_input: Union[str, Path, bytes, np.ndarray, Image.Image]) -> np.ndarray:
    """Validate image integrity, dimensions, and decompression limit.

    Returns:
        np.ndarray: uint8 RGB numpy array.
    """
    try:
        if isinstance(image_input, np.ndarray):
            if image_input.size == 0:
                raise InvalidFileError("Image array is empty")
            return image_input

        if isinstance(image_input, Image.Image):
            pil_img = image_input
        elif isinstance(image_input, bytes):
            if len(image_input) == 0:
                raise InvalidFileError("Image byte stream is empty")
            pil_img = Image.open(io.BytesIO(image_input))
        else:
            p = Path(image_input)
            if not p.exists():
                from cor_engine.core.exceptions import MissingFileError
                raise MissingFileError(f"Image file does not exist: {p}")
            if p.stat().st_size == 0:
                raise InvalidFileError("Image file is empty (0 bytes)")
            pil_img = Image.open(p)

        pil_img.draft(None, None)
        width, height = pil_img.size
        if width * height > MAX_IMAGE_PIXELS:
            raise SecurityError(f"Image pixel count ({width}x{height}) exceeds allowed limit ({MAX_IMAGE_PIXELS})")

        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        return np.array(pil_img)

    except (SecurityError, InvalidFileError):
        raise
    except Exception as exc:
        raise InvalidFileError(f"Failed to load image: {str(exc)}") from exc


def preprocess_image(
    image: np.ndarray,
    force_enable: Optional[bool] = None,
    enhance_contrast: Optional[bool] = None,
    denoise: Optional[bool] = None,
    max_side_len: int = 4000,
    min_side_len: int = 32
) -> np.ndarray:
    """Configurable image preprocessing pipeline to optimize OCR quality.

    Strategy:
    1. Scaling:
       - Upscale tiny images (< min_side_len) using INTER_CUBIC so PaddleOCR text detection can see characters.
       - Downscale huge images (> max_side_len) using INTER_AREA to prevent memory spikes on large scans.
    2. Denoising (Optional, COR_DENOISE=True):
       - Applies fast Non-Local Means Denoising to clean low-quality scans without blurring text edges.
    3. Contrast Enhancement (CLAHE, COR_CONTRAST_ENHANCEMENT=True):
       - Enhances lightness channel in LAB color space, improving faint or unevenly illuminated receipts.
    """
    is_enabled = COR_PREPROCESSING_ENABLED if force_enable is None else force_enable
    if not is_enabled:
        return image

    do_contrast = COR_CONTRAST_ENHANCEMENT if enhance_contrast is None else enhance_contrast
    do_denoise = COR_DENOISE if denoise is None else denoise

    h, w = image.shape[:2]

    # 1. Scale up very small images for textline detection
    if h < min_side_len or w < min_side_len:
        scale = max(min_side_len / max(h, 1), min_side_len / max(w, 1)) * 2
        new_w, new_h = int(w * scale), int(h * scale)
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        h, w = image.shape[:2]

    # 2. Downscale excessively large images to conserve memory and execution time
    if max(h, w) > max_side_len:
        scale = max_side_len / float(max(h, w))
        new_w, new_h = int(w * scale), int(h * scale)
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 3. Optional denoising for noisy/grainy images
    if do_denoise and len(image.shape) == 3:
        image = cv2.fastNlMeansDenoisingColored(image, None, 10, 10, 7, 21)

    # 4. Contrast enhancement (CLAHE on L-channel)
    if do_contrast:
        if len(image.shape) == 2:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            image = clahe.apply(image)
        elif len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
            l_enhanced = clahe.apply(l)
            merged = cv2.merge((l_enhanced, a, b))
            image = cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)

    return image
