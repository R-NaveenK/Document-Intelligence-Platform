import cv2
import numpy as np
from PIL import Image
from typing import Tuple, Optional
from app.core.config import settings
from app.core.logging_config import logger


class ImagePreprocessor:
    """
    Conservative image preprocessor designed for high-speed document OCR extraction.
    Enhances image clarity while strictly preserving fine details:
    decimal points, currency symbols (₹, $, €), small digits, and punctuation.
    Includes smart resolution scaling (max 1024px side length) for rapid CPU extraction.
    """

    def __init__(self,
                 enable_deskew: Optional[bool] = None,
                 enable_contrast: Optional[bool] = None,
                 enable_denoise: Optional[bool] = None,
                 max_side_length: int = 1024):
        self.enable_deskew = settings.PREPROCESS_DESKEW if enable_deskew is None else enable_deskew
        self.enable_contrast = settings.PREPROCESS_CONTRAST if enable_contrast is None else enable_contrast
        self.enable_denoise = settings.PREPROCESS_DENOISE if enable_denoise is None else enable_denoise
        self.max_side_length = max_side_length

    def preprocess(self, pil_image: Image.Image) -> Image.Image:
        """
        Preprocesses a PIL Image and returns an enhanced PIL Image.
        Original image is never modified.
        """
        if not settings.ENABLE_PREPROCESSING:
            return pil_image

        try:
            # 0. Smart Resolution Downscaling for high-speed CPU OCR
            w, h = pil_image.size
            if max(w, h) > self.max_side_length:
                scale = self.max_side_length / float(max(w, h))
                new_w, new_h = int(w * scale), int(h * scale)
                pil_image = pil_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
                logger.info(f"Rescaled high-res image from ({w}x{h}) to ({new_w}x{new_h}) for fast CPU extraction.")

            # Convert PIL Image to OpenCV numpy array (BGR)
            img_np = np.array(pil_image.convert("RGB"))
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            # 1. Grayscale Conversion
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

            # 2. Gentle Deskew Correction (only if skew is noticeable, < 15 degrees)
            if self.enable_deskew:
                gray = self._deskew(gray)

            # 3. Gentle Contrast Enhancement via CLAHE (Contrast Limited Adaptive Histogram Equalization)
            if self.enable_contrast:
                clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
                gray = clahe.apply(gray)

            # 4. Subtle Denoising (bilateral filter preserves crisp text edges)
            if self.enable_denoise:
                gray = cv2.bilateralFilter(gray, d=5, sigmaColor=35, sigmaSpace=35)

            # Convert back to PIL Image (RGB format)
            img_rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(img_rgb)

        except Exception as e:
            logger.warning(f"Preprocessing encountered warning: {e}. Falling back to original image.")
            return pil_image

    def _deskew(self, gray: np.ndarray) -> np.ndarray:
        """Corrects slight document skew angles without cropping fine details."""
        try:
            # Calculate text mask
            thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
            coords = np.column_stack(np.where(thresh > 0))
            if len(coords) < 100:
                return gray

            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle

            # Only deskew if rotation angle is significant (>0.5 deg and <15 deg)
            if 0.5 < abs(angle) < 15.0:
                (h, w) = gray.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                gray = cv2.warpAffine(
                    gray, M, (w, h),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REPLICATE
                )
        except Exception:
            pass  # Return unrotated gray image if skew detection fails
        return gray
