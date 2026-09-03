from app.assembly.text_assembler import TextAssembler
from app.models.extraction_result import PageResult, ExtractionStatus

def test_partial_page_failure_assembly():
    page1 = PageResult(page_number=1, raw_text="Page 1 Content", confidence=0.98, character_count=14, word_count=3)
    page2 = PageResult(page_number=2, raw_text="Page 2 Content", confidence=0.95, character_count=14, word_count=3)
    # Page 3 failed
    page4 = PageResult(page_number=4, raw_text="Page 4 Content", confidence=0.92, character_count=14, word_count=3)

    result = TextAssembler.assemble_document_result(
        page_results=[page1, page2, page4],
        processing_time_ms=250,
        failed_pages=[3],
        warnings=["Page 3 OCR failed due to image corruption."],
        errors=[]
    )

    assert result.status == ExtractionStatus.PARTIAL_SUCCESS
    assert result.pages_processed == 3
    assert result.failed_pages == [3]
    assert len(result.warnings) == 1
    assert "Page 1 Content" in result.raw_text
    assert "Page 4 Content" in result.raw_text
