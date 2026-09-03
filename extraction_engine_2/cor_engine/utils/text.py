"""Utilities for reading-order sorting, text assembly, and page formatting."""
import re
from typing import Any, List, Optional, Tuple


def format_page_demarcation(page_num: int) -> str:
    """Format standard human-readable page demarcation boundary."""
    return f"----------------------------------------\nPAGE {page_num}\n----------------------------------------\n"


def clean_raw_text(text: str) -> str:
    """Clean raw extracted text without modifying textual/numerical content.

    Preserves line breaks, Unicode, and punctuation while normalizing line endings.
    """
    if not text:
        return ""
    # Normalize Windows CRLF to standard LF
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse 3+ consecutive newlines to at most 2 newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def sort_ocr_detections(
    boxes_or_polys: List[Any],
    texts: List[str],
    scores: Optional[List[float]] = None,
    y_threshold: float = 12.0
) -> Tuple[List[str], Optional[List[float]]]:
    """Reconstruct natural reading order (top-to-bottom, left-to-right).

    PaddleOCR boxes can be 4-point polygons [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    or bounding boxes [x1, y1, x2, y2].
    Groups lines with similar vertical coordinates (within y_threshold) and sorts left-to-right.
    """
    if not texts:
        return [], scores

    items = []
    for idx, text in enumerate(texts):
        score = scores[idx] if scores and idx < len(scores) else 1.0
        box = boxes_or_polys[idx] if boxes_or_polys and idx < len(boxes_or_polys) else None

        if box is not None:
            # Check polygon format
            if hasattr(box, "__len__") and len(box) == 4 and hasattr(box[0], "__len__"):
                # 4-point polygon
                xs = [pt[0] for pt in box]
                ys = [pt[1] for pt in box]
                min_x, min_y = min(xs), min(ys)
                max_x, max_y = max(xs), max(ys)
                center_y = (min_y + max_y) / 2.0
            elif hasattr(box, "__len__") and len(box) >= 4:
                # [x1, y1, x2, y2]
                min_x, min_y, max_x, max_y = box[0], box[1], box[2], box[3]
                center_y = (min_y + max_y) / 2.0
            else:
                min_x, center_y = 0.0, float(idx)
        else:
            min_x, center_y = 0.0, float(idx)

        items.append({"min_x": min_x, "center_y": center_y, "text": text, "score": score})

    # Sort primarily by center_y, then group into lines
    items.sort(key=lambda item: item["center_y"])

    lines: List[List[dict]] = []
    for item in items:
        if not lines:
            lines.append([item])
        else:
            # Check if item belongs to current line
            last_line = lines[-1]
            last_line_y = sum(x["center_y"] for x in last_line) / len(last_line)
            if abs(item["center_y"] - last_line_y) <= y_threshold:
                last_line.append(item)
            else:
                lines.append([item])

    sorted_texts: List[str] = []
    sorted_scores: List[float] = []

    for line in lines:
        # Sort each line left-to-right
        line.sort(key=lambda x: x["min_x"])
        line_text = " ".join(x["text"] for x in line if x["text"].strip())
        if line_text:
            sorted_texts.append(line_text)
            for x in line:
                sorted_scores.append(x["score"])

    return sorted_texts, sorted_scores
