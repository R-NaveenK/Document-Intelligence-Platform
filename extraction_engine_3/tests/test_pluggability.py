from typing import Union, Optional, Dict, Any, BinaryIO
from pathlib import Path
from app.ocr.base import BaseExtractionEngine
from app.models.extraction_result import ExtractionResult, PageResult, ExtractionStatus

class MockEngine2(BaseExtractionEngine):
    """Candidate Extraction Engine 2 for Comparison Engine testing."""
    def extract(self, document: Union[str, Path, bytes, BinaryIO], original_filename: Optional[str] = None, document_id: Optional[str] = None, options: Optional[Dict[str, Any]] = None) -> ExtractionResult:
        return ExtractionResult(
            engine_id="engine_2",
            status=ExtractionStatus.SUCCESS,
            raw_text="ENGINE 2 CANDIDATE TEXT",
            pages=[PageResult(page_number=1, raw_text="ENGINE 2 CANDIDATE TEXT", confidence=0.98, character_count=23, word_count=4)],
            extraction_confidence=0.98,
            pages_processed=1,
            processing_time_ms=50
        )

    def get_engine_id(self) -> str:
        return "engine_2"

    def get_version(self) -> str:
        return "2.0.0"

    def health_check(self) -> Dict[str, Any]:
        return {"engine_id": "engine_2", "status": "healthy"}


class MockEngine3(BaseExtractionEngine):
    """Candidate Extraction Engine 3 for Comparison Engine testing."""
    def extract(self, document: Union[str, Path, bytes, BinaryIO], original_filename: Optional[str] = None, document_id: Optional[str] = None, options: Optional[Dict[str, Any]] = None) -> ExtractionResult:
        return ExtractionResult(
            engine_id="engine_3",
            status=ExtractionStatus.SUCCESS,
            raw_text="ENGINE 3 CANDIDATE TEXT",
            pages=[PageResult(page_number=1, raw_text="ENGINE 3 CANDIDATE TEXT", confidence=0.94, character_count=23, word_count=4)],
            extraction_confidence=0.94,
            pages_processed=1,
            processing_time_ms=45
        )

    def get_engine_id(self) -> str:
        return "engine_3"

    def get_version(self) -> str:
        return "3.0.0"

    def health_check(self) -> Dict[str, Any]:
        return {"engine_id": "engine_3", "status": "healthy"}


def test_engine_pluggability_contract():
    # Verify that multiple candidate engines implement the exact same BaseExtractionEngine contract
    engines: list[BaseExtractionEngine] = [MockEngine2(), MockEngine3()]
    results = []

    for eng in engines:
        res = eng.extract("dummy_doc.pdf")
        assert isinstance(res, ExtractionResult)
        assert res.engine_id in ["engine_2", "engine_3"]
        assert res.status == ExtractionStatus.SUCCESS
        results.append(res)

    # Downstream Comparison Engine can inspect candidates generically
    assert len(results) == 2
    assert results[0].raw_text != results[1].raw_text
