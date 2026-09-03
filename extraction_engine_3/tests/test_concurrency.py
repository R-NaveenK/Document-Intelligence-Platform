import os
import pytest
from concurrent.futures import ThreadPoolExecutor
from app.engine import ExtractionEngine

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_concurrent_extraction_requests():
    pdf_path = os.path.join(SAMPLE_DIR, "digital_invoice_1.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("digital_invoice_1.pdf missing.")

    engine = ExtractionEngine()

    def run_single(idx):
        res = engine.extract(pdf_path, original_filename=f"doc_{idx}.pdf")
        return res.status.value, len(res.raw_text)

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(run_single, i) for i in range(5)]
        results = [f.result() for f in futures]

    assert len(results) == 5
    for status_str, length in results:
        assert status_str == "success"
        assert length > 0
