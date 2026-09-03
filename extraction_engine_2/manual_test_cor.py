#!/usr/bin/env python3
"""Manual testing interface for the COR extraction engine.

Usage:
  python manual_test_cor.py path/to/document.pdf
  python manual_test_cor.py path/to/document.pdf --ground-truth expected.txt
  python manual_test_cor.py (starts interactive mode)
"""
import argparse
import difflib
import logging
from pathlib import Path
import re
import sys
import time
from typing import List, Optional, Tuple

from cor_engine.core.engine import CORExtractionEngine
from cor_engine.core.result import ExtractionStatus


def calculate_cer(expected: str, actual: str) -> float:
    """Calculate Character Error Rate (CER) using Levenshtein distance."""
    if not expected:
        return 0.0 if not actual else 1.0

    m, n = len(expected), len(actual)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if expected[i - 1] == actual[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,       # Deletion
                dp[i][j - 1] + 1,       # Insertion
                dp[i - 1][j - 1] + cost # Substitution
            )

    return min(dp[m][n] / max(m, 1), 1.0)


def extract_numbers(text: str) -> List[str]:
    """Extract sequences of digits, decimal numbers, and currency figures."""
    return re.findall(r"(?:[₹$€£¥]\s*)?\b\d+(?:[\.,]\d+)*\b", text)


def compare_with_ground_truth(actual_text: str, gt_path: Path) -> dict:
    """Compare extracted raw text with independent ground-truth text file."""
    if not gt_path.exists():
        return {"error": f"Ground-truth file not found: {gt_path}"}

    expected_text = gt_path.read_text(encoding="utf-8", errors="replace")

    seq = difflib.SequenceMatcher(None, expected_text, actual_text)
    similarity_pct = round(seq.ratio() * 100, 2)

    cer = round(calculate_cer(expected_text, actual_text) * 100, 2)

    expected_lines = [l.strip() for l in expected_text.splitlines() if l.strip()]
    actual_lines = [l.strip() for l in actual_text.splitlines() if l.strip()]

    missing_content = [line for line in expected_lines if line.lower() not in actual_text.lower()]
    unexpected_content = [line for line in actual_lines if line.lower() not in expected_text.lower()]

    expected_nums = extract_numbers(expected_text)
    actual_nums = extract_numbers(actual_text)
    missing_nums = [n for n in expected_nums if n not in actual_nums]
    extra_nums = [n for n in actual_nums if n not in expected_nums]

    return {
        "expected_chars": len(expected_text),
        "actual_chars": len(actual_text),
        "similarity_pct": similarity_pct,
        "cer_pct": cer,
        "missing_content": missing_content,
        "unexpected_content": unexpected_content,
        "missing_numbers": missing_nums,
        "extra_numbers": extra_nums,
    }


def run_manual_extraction(
    document_path: Path,
    output_location: Optional[Path] = None,
    show_metadata_only: bool = False,
    ground_truth_path: Optional[Path] = None,
    verbose: bool = False
):
    """Execute real COR extraction pipeline on document and print formatted terminal report."""
    if verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)

    output_dir = output_location.parent if output_location else None
    doc_id = output_location.stem if output_location else document_path.stem

    engine = CORExtractionEngine(output_dir=output_dir)

    t0 = time.perf_counter()
    result = engine.extract(input_file=document_path, document_id=doc_id)
    t1 = time.perf_counter()
    elapsed_sec = round(t1 - t0, 2)

    # Optional custom output saving if requested
    if output_location and result.raw_text:
        output_location.parent.mkdir(parents=True, exist_ok=True)
        output_location.write_text(result.raw_text, encoding="utf-8")

    artifact_disp = str(output_location) if output_location else (result.raw_file_path or "N/A")

    print("\n" + "=" * 50)
    print("COR MANUAL EXTRACTION TEST")
    print("=" * 50 + "\n")

    print("Document:")
    print(f"{document_path.name}\n")

    print("Document Type:")
    print(f"{result.file_type or 'UNKNOWN'}\n")

    print("Status:")
    print(f"{result.status.value.upper()}\n")

    print("Pages Processed:")
    print(f"{result.pages_processed}\n")

    print("Processing Time:")
    print(f"{elapsed_sec:.2f} seconds\n")

    print("Output Artifact:")
    print(f"{artifact_disp}\n")

    if result.status == ExtractionStatus.SUCCESS:
        if not show_metadata_only:
            print("-" * 50)
            print("RAW EXTRACTED TEXT")
            print("-" * 50 + "\n")
            print(result.raw_text or "(No text extracted)")
            print("\n")

        print("-" * 50)
        print("EXTRACTION METADATA")
        print("-" * 50 + "\n")
        print("Engine:")
        print("COR\n")
        print("OCR:")
        print("PaddleOCR\n")
        print("Characters Extracted:")
        print(f"{result.characters_extracted}\n")
        print("Confidence:")
        conf_str = f"{result.extraction_confidence:.2f}" if result.extraction_confidence is not None else "1.00"
        print(f"{conf_str}\n")

        if ground_truth_path:
            print("-" * 50)
            print("GROUND TRUTH COMPARISON EVALUATION")
            print("-" * 50 + "\n")
            gt_res = compare_with_ground_truth(result.raw_text or "", ground_truth_path)
            if "error" in gt_res:
                print(f"Error: {gt_res['error']}\n")
            else:
                print(f"Expected characters: {gt_res['expected_chars']}")
                print(f"Actual characters:   {gt_res['actual_chars']}\n")
                print(f"Text similarity:       {gt_res['similarity_pct']}%")
                print(f"Character error rate:  {gt_res['cer_pct']}%\n")

                if gt_res["missing_content"]:
                    print(f"Missing content ({len(gt_res['missing_content'])} items):")
                    for item in gt_res["missing_content"][:5]:
                        print(f"  - {item}")
                    if len(gt_res["missing_content"]) > 5:
                        print(f"  ... and {len(gt_res['missing_content']) - 5} more")
                    print()

                if gt_res["missing_numbers"]:
                    print(f"Numerical differences / missing numbers ({len(gt_res['missing_numbers'])} items):")
                    for num in gt_res["missing_numbers"][:5]:
                        print(f"  - Missing expected number: {num}")
                    print()
    else:
        print("-" * 50)
        print("EXTRACTION FAILURE DETAILS")
        print("-" * 50 + "\n")
        print("Error Code:")
        print(f"{result.error_code}\n")
        print("Message:")
        print(f"{result.error_message}\n")

    print("=" * 50 + "\n")


def run_interactive_mode():
    """Interactive CLI terminal session prompting for document paths."""
    print("=" * 40)
    print("COR MANUAL TEST MODE")
    print("=" * 40 + "\n")

    while True:
        try:
            user_input = input("Enter document path:\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting interactive mode.")
            break

        if not user_input:
            print("Path cannot be empty.")
            continue

        doc_path = Path(user_input.strip('"\''))
        if not doc_path.exists():
            print(f"File not found: {doc_path}")
            continue

        run_manual_extraction(document_path=doc_path)

        try:
            choice = input("Run another document? [y/N]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break

        if choice not in ("y", "yes"):
            print("Exiting interactive mode.")
            break


def main():
    parser = argparse.ArgumentParser(
        prog="manual_test_cor.py",
        description="COR Manual Extraction Engine Testing Interface"
    )
    parser.add_argument(
        "document",
        nargs="?",
        default=None,
        help="Path to document (PDF, DOC, DOCX, TXT, JPG, JPEG, PNG)"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default=None,
        help="Custom output file location to save the raw .txt artifact"
    )
    parser.add_argument(
        "--metadata",
        action="store_true",
        help="Display extraction metadata only (suppress printing raw text)"
    )
    parser.add_argument(
        "--show-text",
        action="store_true",
        help="Force displaying raw extracted text"
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save raw text artifact to disk and display text"
    )
    parser.add_argument(
        "--ground-truth",
        type=str,
        default=None,
        help="Path to independent ground-truth expected text file for evaluation"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose debug logging"
    )

    args = parser.parse_args()

    if args.document is None:
        run_interactive_mode()
    else:
        doc_path = Path(args.document)
        if not doc_path.exists():
            print(f"Error: Input document not found: {doc_path}", file=sys.stderr)
            sys.exit(1)

        output_path = Path(args.output) if args.output else None
        gt_path = Path(args.ground_truth) if args.ground_truth else None

        run_manual_extraction(
            document_path=doc_path,
            output_location=output_path,
            show_metadata_only=args.metadata and not args.show_text,
            ground_truth_path=gt_path,
            verbose=args.verbose,
        )


if __name__ == "__main__":
    main()
