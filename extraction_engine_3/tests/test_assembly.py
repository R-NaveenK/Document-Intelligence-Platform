from app.assembly.text_assembler import TextAssembler
from app.models.extraction_result import PageResult, ExtractionStatus

def test_text_assembler_page_result():
    lines = [
        ("ABC TECHNOLOGIES", 0.95),
        ("Total: RS 82,500", 0.99)
    ]
    page_res = TextAssembler.build_page_result(1, lines)
    assert page_res.page_number == 1
    assert "ABC TECHNOLOGIES" in page_res.raw_text
    assert "Total: RS 82,500" in page_res.raw_text
    assert page_res.confidence > 0.90

def test_text_assembler_multipage_document():
    page1 = PageResult(page_number=1, raw_text="Page 1 Content\nInvoice #102", confidence=0.95, character_count=26, word_count=5)
    page2 = PageResult(page_number=2, raw_text="Page 2 Content\nTotal RS 500", confidence=0.90, character_count=26, word_count=5)

    doc_res = TextAssembler.assemble_document_result(
        page_results=[page1, page2],
        processing_time_ms=120,
        failed_pages=[],
        warnings=[],
        errors=[]
    )

    assert doc_res.status == ExtractionStatus.SUCCESS
    assert doc_res.pages_processed == 2
    assert "[PAGE_BREAK]" in doc_res.raw_text
    assert doc_res.extraction_confidence == 0.925
