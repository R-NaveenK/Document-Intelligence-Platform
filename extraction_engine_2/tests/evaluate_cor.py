"""Evaluation and stress-testing harness for the COR extraction engine."""
import json
import os
from pathlib import Path
import re
import sys
import time
from typing import Any, Dict, List, Tuple

# Ensure workspace root is in sys.path
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from cor_engine.core.engine import CORExtractionEngine
from cor_engine.core.result import ExtractionStatus


def normalize_for_eval(text: str) -> str:
    """Normalize whitespace and case for relaxed matching evaluation."""
    if not text:
        return ""
    # Normalize unicode non-breaking spaces and collapse whitespaces
    s = text.replace("\u00a0", " ").replace("\u202f", " ")
    return re.sub(r"\s+", " ", s).strip()


def check_exact_match(needle: str, haystack: str) -> bool:
    """Check if needle appears in haystack with normalized whitespace."""
    if not needle or not haystack:
        return False
    # Direct substring check
    if needle in haystack:
        return True
    # Normalized whitespace check
    n_needle = normalize_for_eval(needle)
    n_haystack = normalize_for_eval(haystack)
    if n_needle.lower() in n_haystack.lower():
        return True
    # Whitespace-removed check (handles OCR merging adjacent words like "TAXINVOICE")
    stripped_needle = re.sub(r"\s+", "", needle).lower()
    stripped_haystack = re.sub(r"\s+", "", haystack).lower()
    if stripped_needle in stripped_haystack:
        return True
    return False


def detect_character_confusions(expected: str, observed: str) -> List[str]:
    """Detect common OCR confusions between expected string and extracted text:
    O <-> 0, I <-> 1, l <-> 1, S <-> 5, B <-> 8, G <-> 6, Z <-> 2
    """
    confusions = []
    # Test common character pair confusions if expected not directly found
    confusion_pairs = [
        ("O", "0"), ("0", "O"),
        ("I", "1"), ("1", "I"),
        ("l", "1"), ("1", "l"),
        ("S", "5"), ("5", "S"),
        ("B", "8"), ("8", "B"),
        ("G", "6"), ("6", "G"),
        ("Z", "2"), ("2", "Z"),
    ]

    for c1, c2 in confusion_pairs:
        pattern = expected.replace(c1, c2)
        if pattern != expected and pattern in observed:
            confusions.append(f"Confusion '{c1}' recognized as '{c2}' in '{expected}' -> '{pattern}'")

    return confusions


def evaluate_document(engine: CORExtractionEngine, file_path: Path, gt: Dict[str, Any]) -> Dict[str, Any]:
    """Run extraction and evaluate against ground truth."""
    doc_id = f"eval_{file_path.stem}"
    file_size_bytes = file_path.stat().st_size

    t0 = time.perf_counter()
    result = engine.extract(file_path, document_id=doc_id)
    t1 = time.perf_counter()
    elapsed_ms = int((t1 - t0) * 1000)

    extracted_text = result.raw_text or ""
    status_str = result.status.value

    # 1. Text recall
    required_text = gt.get("required_text", [])
    text_matches = 0
    missing_text = []
    for item in required_text:
        if check_exact_match(item, extracted_text):
            text_matches += 1
        else:
            missing_text.append(item)
    text_recall = (text_matches / len(required_text)) if required_text else 1.0

    # 2. Numerical accuracy
    required_numbers = gt.get("required_numbers", [])
    num_matches = 0
    missing_numbers = []
    confusions = []
    for num in required_numbers:
        if check_exact_match(num, extracted_text):
            num_matches += 1
        else:
            missing_numbers.append(num)
            cf = detect_character_confusions(num, extracted_text)
            confusions.extend(cf)

    num_accuracy = (num_matches / len(required_numbers)) if required_numbers else 1.0

    # 3. Page completeness
    expected_pages = gt.get("expected_pages", 1)
    pages_processed = result.pages_processed
    page_completeness = (pages_processed / expected_pages) if expected_pages else 1.0

    # 4. Output artifact check
    artifact_path = result.raw_file_path
    artifact_valid = False
    artifact_size = 0
    if artifact_path and Path(artifact_path).exists():
        artifact_valid = True
        artifact_size = Path(artifact_path).stat().st_size

    return {
        "file": file_path.name,
        "path": str(file_path),
        "file_type": result.file_type or gt.get("type", "UNKNOWN"),
        "status": status_str,
        "pages_processed": pages_processed,
        "expected_pages": expected_pages,
        "characters_extracted": result.characters_extracted,
        "elapsed_ms": elapsed_ms,
        "confidence": result.extraction_confidence,
        "text_recall": round(text_recall, 4),
        "numeric_accuracy": round(num_accuracy, 4),
        "missing_text": missing_text,
        "missing_numbers": missing_numbers,
        "confusions": confusions,
        "artifact_valid": artifact_valid,
        "artifact_size": artifact_size,
        "artifact_path": artifact_path,
        "extracted_text": extracted_text,
        "file_size_bytes": file_size_bytes,
        "error_code": result.error_code,
    }



def evaluate_corrupted_files(engine: CORExtractionEngine) -> List[Dict[str, Any]]:
    """Verify that empty and corrupted documents produce structured errors, not empty success."""
    corrupt_dir = Path("tests/test_documents/corrupt")
    results = []
    for f in corrupt_dir.iterdir():
        t0 = time.perf_counter()
        res = engine.extract(f, document_id=f"eval_corrupt_{f.stem}")
        t1 = time.perf_counter()
        results.append({
            "file": f.name,
            "status": res.status.value,
            "error_code": res.error_code,
            "error_message": res.error_message,
            "time_ms": int((t1 - t0) * 1000),
            "expected_fail": True,
            "passed": (res.status == ExtractionStatus.FAILED and res.error_code is not None),
        })
    return results


def run_full_evaluation() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    gt_file = Path("tests/ground_truth.json")
    if not gt_file.exists():
        raise FileNotFoundError(f"Missing ground truth file: {gt_file}")

    ground_truth = json.loads(gt_file.read_text(encoding="utf-8"))
    engine = CORExtractionEngine()

    print("================================================================================")
    print("RUNNING COR EXTRACTION BENCHMARK & EVALUATION")
    print("================================================================================")

    doc_results = []
    for file_str, gt in ground_truth.items():
        fpath = Path(file_str)
        if not fpath.exists():
            print(f"Skipping missing file: {fpath}")
            continue
        print(f"Evaluating: {fpath.name:<25} ({gt['type']})...", end="", flush=True)
        res = evaluate_document(engine, fpath, gt)
        print(f" DONE | Status: {res['status']:<7} | Recall: {res['text_recall']*100:5.1f}% | NumAcc: {res['numeric_accuracy']*100:5.1f}% | Time: {res['elapsed_ms']}ms")
        doc_results.append(res)

    print("-" * 80)
    print("Evaluating Corrupted & Empty Inputs...")
    corrupt_results = evaluate_corrupted_files(engine)
    for cr in corrupt_results:
        print(f"Corrupt input: {cr['file']:<20} -> Status: {cr['status']} | Code: {cr['error_code']} | Passed: {cr['passed']}")

    # Aggregations
    total_docs = len(doc_results)
    successful_docs = sum(1 for r in doc_results if r["status"] == "success")
    avg_recall = sum(r["text_recall"] for r in doc_results) / total_docs if total_docs else 0.0
    avg_num_acc = sum(r["numeric_accuracy"] for r in doc_results) / total_docs if total_docs else 0.0
    total_time_ms = sum(r["elapsed_ms"] for r in doc_results)
    total_chars = sum(r["characters_extracted"] for r in doc_results)
    total_pages = sum(r["pages_processed"] for r in doc_results)

    summary = {
        "total_documents": total_docs,
        "successful_documents": successful_docs,
        "failed_documents": total_docs - successful_docs,
        "avg_text_recall": round(avg_recall, 4),
        "avg_numeric_accuracy": round(avg_num_acc, 4),
        "total_time_ms": total_time_ms,
        "total_chars_extracted": total_chars,
        "total_pages_processed": total_pages,
        "chars_per_second": round(total_chars / (total_time_ms / 1000), 2) if total_time_ms else 0,
        "pages_per_second": round(total_pages / (total_time_ms / 1000), 4) if total_time_ms else 0,
    }

    return doc_results, corrupt_results, summary


if __name__ == "__main__":
    doc_res, corrupt_res, summ = run_full_evaluation()
    print("\nSummary:")
    print(json.dumps(summ, indent=2))
