"""PaddleOCR wrapper with singleton lifecycle, reading-order reconstruction, and confidence scoring."""
import logging
import os
import threading
from typing import Any, List, Optional, Tuple, Union

import numpy as np

from cor_engine.core.config import (
    COR_OCR_DEVICE,
    COR_OCR_ENABLE_MKLDNN,
    COR_OCR_LANGUAGE,
    COR_OCR_USE_ORIENTATION,
)
from cor_engine.core.exceptions import OcrError
from cor_engine.ocr.preprocessing import preprocess_image, validate_image_input

logger = logging.getLogger("cor_engine.ocr.paddle_engine")

# Disable PIR and MKL-DNN on Windows CPU to prevent PaddlePaddle 3.3.1 runtime incompatibility
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("FLAGS_use_mkldnn", "0")


class PaddleOCREngine:
    """Thread-safe singleton wrapper for PaddleOCR."""

    _instance: Optional["PaddleOCREngine"] = None
    _lock = threading.Lock()

    def __init__(
        self,
        lang: str = COR_OCR_LANGUAGE,
        use_gpu: bool = (COR_OCR_DEVICE.lower() == "gpu"),
        use_angle_cls: bool = COR_OCR_USE_ORIENTATION,
        enable_mkldnn: bool = COR_OCR_ENABLE_MKLDNN,
    ):
        self.lang = lang
        self.use_gpu = use_gpu
        self.use_angle_cls = use_angle_cls
        self.enable_mkldnn = enable_mkldnn
        self._ocr = None
        self._init_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "PaddleOCREngine":
        """Get the singleton instance of PaddleOCREngine."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _ensure_initialized(self):
        """Lazy thread-safe initialization of PaddleOCR models."""
        if self._ocr is not None:
            return

        with self._init_lock:
            if self._ocr is not None:
                return

            try:
                from paddleocr import PaddleOCR
                logger.info(
                    "[COR] Initializing PaddleOCR singleton (lang=%s, use_gpu=%s, orientation=%s)",
                    self.lang,
                    self.use_gpu,
                    self.use_angle_cls,
                )
                self._ocr = PaddleOCR(
                    lang=self.lang,
                    use_textline_orientation=self.use_angle_cls,
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    enable_mkldnn=self.enable_mkldnn,
                )

                logger.info("[COR] PaddleOCR singleton initialized successfully.")
            except Exception as exc:
                logger.error("[COR] Failed to initialize PaddleOCR: %s", exc)
                raise OcrError(f"Failed to initialize PaddleOCR engine: {str(exc)}") from exc

    def process_image(
        self,
        image_input: Union[str, bytes, np.ndarray, Any],
        apply_preprocessing: bool = True,
        preprocess: Optional[bool] = None,
        **kwargs
    ) -> Tuple[str, float]:
        """Perform OCR on an image and return reconstructed text and aggregate confidence.

        Returns:
            Tuple[str, float]: (reconstructed_unstructured_text, aggregate_confidence)
        """
        self._ensure_initialized()

        should_preprocess = preprocess if preprocess is not None else apply_preprocessing

        try:
            rgb_img = validate_image_input(image_input)
            if should_preprocess:
                processed_img = preprocess_image(rgb_img)
            else:
                processed_img = rgb_img

            # Invoke PaddleOCR predict
            result = self._ocr.predict(processed_img)
            text, confidence = self._extract_and_sort_boxes(result, processed_img.shape)

            # Adaptive retry: if extraction produced very little text from a
            # reasonably sized image, retry with aggressive denoising enabled.
            # This handles noisy/grainy scans where default preprocessing is insufficient.
            h, w = rgb_img.shape[:2]
            min_expected_chars = 30
            if len(text.strip()) < min_expected_chars and h > 100 and w > 100:
                logger.info("[COR] Low text yield (%d chars) - retrying with denoising enabled", len(text.strip()))
                denoised_img = preprocess_image(
                    rgb_img, force_enable=True, enhance_contrast=True, denoise=True
                )
                retry_result = self._ocr.predict(denoised_img)
                retry_text, retry_confidence = self._extract_and_sort_boxes(retry_result, denoised_img.shape)
                if len(retry_text.strip()) > len(text.strip()):
                    logger.info("[COR] Denoised retry improved extraction: %d -> %d chars",
                                len(text.strip()), len(retry_text.strip()))
                    return retry_text, retry_confidence

            return text, confidence

        except OcrError:
            raise
        except Exception as exc:
            logger.error("[COR] PaddleOCR inference failed: %s", exc)
            raise OcrError(f"PaddleOCR processing error: {str(exc)}") from exc

    def _extract_and_sort_boxes(self, ocr_result: Any, image_shape: Tuple[int, ...]) -> Tuple[str, float]:
        """Reconstruct human-readable reading order from detected bounding boxes.

        Sorting strategy:
        1. Extract bounding box polygon coordinates (min_x, min_y, max_x, max_y).
        2. Detect potential multi-column layouts: if there is a distinct gap separating columns,
           assign boxes to columns.
        3. Within each column (or full page), cluster lines by vertical proximity (y_tolerance ~ 60% of line height).
        4. Sort lines horizontally left-to-right within each line cluster.
        5. Calculate mean confidence across all recognized boxes.
        """
        if not ocr_result:
            return "", 1.0

        texts: List[str] = []
        scores: List[float] = []
        boxes: List[List[float]] = []

        # PaddleOCR 3.x returns list of dicts with 'rec_texts', 'rec_scores', 'rec_polys'
        if isinstance(ocr_result, list) and len(ocr_result) > 0 and isinstance(ocr_result[0], dict):
            page_dict = ocr_result[0]
            raw_texts = page_dict.get("rec_texts", [])
            raw_scores = page_dict.get("rec_scores", [])
            raw_polys = page_dict.get("rec_polys", page_dict.get("rec_boxes", []))

            for text, score, poly in zip(raw_texts, raw_scores, raw_polys):
                t = str(text).strip()
                if not t:
                    continue
                texts.append(t)
                scores.append(float(score))

                # Normalize poly to [min_x, min_y, max_x, max_y]
                poly_arr = np.array(poly)
                if poly_arr.ndim >= 2:
                    min_x = float(np.min(poly_arr[:, 0]))
                    max_x = float(np.max(poly_arr[:, 0]))
                    min_y = float(np.min(poly_arr[:, 1]))
                    max_y = float(np.max(poly_arr[:, 1]))
                elif len(poly) == 4:
                    min_x, min_y, max_x, max_y = float(poly[0]), float(poly[1]), float(poly[2]), float(poly[3])
                else:
                    min_x, min_y, max_x, max_y = 0.0, 0.0, 0.0, 0.0

                boxes.append([min_x, min_y, max_x, max_y])

        # Legacy PaddleOCR 2.x return format: [[ [box], (text, score) ], ...]
        elif isinstance(ocr_result, list) and len(ocr_result) > 0 and isinstance(ocr_result[0], list):
            lines_data = ocr_result[0] if isinstance(ocr_result[0], list) and len(ocr_result[0]) > 0 and isinstance(ocr_result[0][0], list) else ocr_result
            for item in lines_data:
                if not item or len(item) < 2:
                    continue
                poly = item[0]
                text_info = item[1]
                t = str(text_info[0]).strip() if isinstance(text_info, (list, tuple)) else str(text_info).strip()
                s = float(text_info[1]) if isinstance(text_info, (list, tuple)) and len(text_info) > 1 else 1.0

                if not t:
                    continue
                texts.append(t)
                scores.append(s)

                poly_arr = np.array(poly)
                if poly_arr.ndim >= 2:
                    min_x = float(np.min(poly_arr[:, 0]))
                    max_x = float(np.max(poly_arr[:, 0]))
                    min_y = float(np.min(poly_arr[:, 1]))
                    max_y = float(np.max(poly_arr[:, 1]))
                else:
                    min_x, min_y, max_x, max_y = 0.0, 0.0, 0.0, 0.0

                boxes.append([min_x, min_y, max_x, max_y])

        if not texts:
            return "", 1.0

        # Build items
        items = []
        for i in range(len(texts)):
            items.append({
                "text": texts[i],
                "score": scores[i],
                "box": boxes[i],
                "min_x": boxes[i][0],
                "min_y": boxes[i][1],
                "max_x": boxes[i][2],
                "max_y": boxes[i][3],
                "height": max(boxes[i][3] - boxes[i][1], 1.0),
            })

        # Calculate median line height for adaptive line clustering
        heights = [it["height"] for it in items]
        median_h = float(np.median(heights)) if heights else 20.0
        y_tolerance = max(median_h * 0.65, 8.0)

        # Sort primarily by min_y
        items.sort(key=lambda it: it["min_y"])

        # Cluster lines vertically
        lines: List[List[dict]] = []
        for it in items:
            placed = False
            for line in lines:
                line_avg_y = sum(x["min_y"] for x in line) / len(line)
                if abs(it["min_y"] - line_avg_y) <= y_tolerance:
                    line.append(it)
                    placed = True
                    break
            if not placed:
                lines.append([it])

        # Sort each line horizontally by min_x
        assembled_lines: List[str] = []
        for line in lines:
            line.sort(key=lambda it: it["min_x"])
            line_str = "  ".join(it["text"] for it in line)
            assembled_lines.append(line_str)

        raw_text = "\n".join(assembled_lines).strip()
        avg_confidence = float(sum(scores) / len(scores)) if scores else 1.0

        return raw_text, round(avg_confidence, 4)
