"""Measure extraction engine performance metrics across document types (Section 27)."""
import time
from pathlib import Path
from cor_engine import CORExtractionEngine

CORPUS_DIR = Path("./test_corpus")

TEST_FILES = [
    ("TXT Plain", CORPUS_DIR / "G_plain.txt"),
    ("PDF Digital", CORPUS_DIR / "A_invoice_digital.pdf"),
    ("PDF Multi-page", CORPUS_DIR / "H_multipage.pdf"),
    ("DOCX Enterprise", CORPUS_DIR / "E_business.docx"),
    ("DOC Legacy", CORPUS_DIR / "F_legacy.doc"),
    ("PNG Scan", CORPUS_DIR / "C_invoice.png"),
    ("JPG Scan", CORPUS_DIR / "D_invoice.jpg"),
    ("PDF Scanned", CORPUS_DIR / "B_invoice_scanned.pdf"),
]


def run_benchmark():
    engine = CORExtractionEngine()

    print("================================================================================")
    print("COR EXTRACTION ENGINE PERFORMANCE BENCHMARK")
    print("================================================================================")
    print(f"{'Document':<20} | {'Status':<7} | {'Pages':<5} | {'Chars':<6} | {'Time (ms)':<10} | {'Confidence':<10}")
    print("-" * 80)

    total_chars = 0
    total_pages = 0
    total_time_ms = 0

    for label, path in TEST_FILES:
        if not path.exists():
            continue

        t0 = time.perf_counter()
        res = engine.extract(path, document_id=f"bench_{path.stem}")
        t1 = time.perf_counter()
        elapsed_ms = int((t1 - t0) * 1000)

        conf_str = f"{res.extraction_confidence:.2f}" if res.extraction_confidence is not None else "1.00"

        print(f"{label:<20} | {res.status.value:<7} | {res.pages_processed:<5} | {res.characters_extracted:<6} | {elapsed_ms:<10} | {conf_str:<10}")

        total_chars += res.characters_extracted
        total_pages += res.pages_processed
        total_time_ms += elapsed_ms

    print("-" * 80)
    print(f"Totals: {total_pages} pages processed, {total_chars} chars extracted in {total_time_ms} ms")
    print("================================================================================")


if __name__ == "__main__":
    run_benchmark()
