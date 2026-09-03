from typing import List, Dict, Any, Tuple
from app.models.extraction_result import PageResult, ExtractionResult, ExtractionStatus
from app.core.config import settings


class TextAssembler:
    """
    Assembles extracted text blocks from single or multi-page documents.
    Preserves top-to-bottom readable text ordering and page break demarcations ([PAGE_BREAK]).
    Computes transparent character-weighted average confidence scores.
    """

    @staticmethod
    def sort_ocr_boxes(boxes_with_text: List[Tuple[Any, str, float]]) -> List[Tuple[str, float]]:
        """
        Sorts OCR detection boxes into natural reading order (top-to-bottom, left-to-right).
        
        Args:
            boxes_with_text: List of tuples (bbox_polygon, text, confidence)
            
        Returns:
            List of sorted (text, confidence)
        """
        if not boxes_with_text:
            return []

        def get_top_left(item):
            bbox = item[0]
            if isinstance(bbox, (list, tuple)) and len(bbox) > 0:
                # Bounding box is list of [x, y] coordinates
                y_min = min(point[1] for point in bbox)
                x_min = min(point[0] for point in bbox)
                return (y_min, x_min)
            return (0, 0)

        # Sort primarily by vertical Y position (grouped into ~15px lines) then horizontal X
        # To group lines reasonably: round Y to nearest 15 pixels
        def line_group_key(item):
            y, x = get_top_left(item)
            line_bucket = round(y / 15.0) * 15
            return (line_bucket, x)

        sorted_items = sorted(boxes_with_text, key=line_group_key)
        return [(text, float(conf)) for _, text, conf in sorted_items]

    @staticmethod
    def build_page_result(
        page_number: int,
        lines_with_conf: List[Tuple[str, float]]
    ) -> PageResult:
        """
        Assembles lines of text into a PageResult object with weighted confidence.
        """
        if not lines_with_conf:
            return PageResult(
                page_number=page_number,
                raw_text="",
                confidence=1.0,
                character_count=0,
                word_count=0
            )

        text_lines = []
        total_weighted_conf = 0.0
        total_chars = 0

        for line_text, conf in lines_with_conf:
            cleaned_line = line_text.strip()
            if not cleaned_line:
                continue
            text_lines.append(cleaned_line)
            line_len = len(cleaned_line)
            total_weighted_conf += conf * line_len
            total_chars += line_len

        page_raw_text = "\n".join(text_lines)
        page_confidence = (total_weighted_conf / total_chars) if total_chars > 0 else 1.0
        # Round confidence to 4 decimal places
        page_confidence = round(max(0.0, min(1.0, page_confidence)), 4)

        words = page_raw_text.split()

        return PageResult(
            page_number=page_number,
            raw_text=page_raw_text,
            confidence=page_confidence,
            character_count=len(page_raw_text),
            word_count=len(words)
        )

    @staticmethod
    def assemble_document_result(
        page_results: List[PageResult],
        processing_time_ms: int,
        failed_pages: List[int],
        warnings: List[str],
        errors: List[str],
        original_filename: str = None,
        file_type: str = None,
        document_id: str = None
    ) -> ExtractionResult:
        """
        Combines per-page extraction results into the final standard ExtractionResult.
        Injects [PAGE_BREAK] delimiters between page text blocks.
        """
        if not page_results and not failed_pages:
            status = ExtractionStatus.ERROR
        elif failed_pages and page_results:
            status = ExtractionStatus.PARTIAL_SUCCESS
        elif failed_pages and not page_results:
            status = ExtractionStatus.ERROR
        else:
            status = ExtractionStatus.SUCCESS

        page_texts = [p.raw_text for p in page_results if p.raw_text.strip()]
        combined_raw_text = "\n\n[PAGE_BREAK]\n\n".join(page_texts)

        # Aggregate overall document confidence weighted by page character count
        total_doc_weighted_conf = 0.0
        total_doc_chars = 0
        for p in page_results:
            if p.character_count > 0:
                total_doc_weighted_conf += p.confidence * p.character_count
                total_doc_chars += p.character_count

        if total_doc_chars > 0:
            doc_confidence = total_doc_weighted_conf / total_doc_chars
        elif page_results:
            doc_confidence = sum(p.confidence for p in page_results) / len(page_results)
        else:
            doc_confidence = 0.0

        doc_confidence = round(max(0.0, min(1.0, doc_confidence)), 4)

        return ExtractionResult(
            engine_id=settings.ENGINE_ID,
            status=status,
            raw_text=combined_raw_text,
            pages=page_results,
            extraction_confidence=doc_confidence,
            pages_processed=len(page_results),
            failed_pages=failed_pages,
            processing_time_ms=processing_time_ms,
            original_filename=original_filename,
            file_type=file_type,
            engine_version=settings.ENGINE_VERSION,
            warnings=warnings,
            errors=errors,
            document_id=document_id
        )
