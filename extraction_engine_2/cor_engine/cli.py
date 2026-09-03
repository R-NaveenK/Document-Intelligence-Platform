"""Command line interface (CLI) for COR extraction engine."""
import argparse
from pathlib import Path
import sys

from cor_engine.core.engine import CORExtractionEngine
from cor_engine.core.result import ExtractionStatus


def run_cli(args=None):
    parser = argparse.ArgumentParser(
        prog="cor-extract",
        description="COR Independent Document Extraction Engine (PaddleOCR-based)"
    )
    parser.add_argument(
        "-i", "--input",
        required=True,
        type=str,
        help="Path to the document to extract (PDF, DOC, DOCX, TXT, JPG, JPEG, PNG)"
    )
    parser.add_argument(
        "-d", "--doc-id",
        type=str,
        default=None,
        help="Optional unique document identifier (defaults to sanitized filename)"
    )
    parser.add_argument(
        "-o", "--output-dir",
        type=str,
        default=None,
        help="Directory to save the raw .txt extraction artifact"
    )
    parser.add_argument(
        "--print-text",
        action="store_true",
        help="Print the full extracted raw text to stdout (default: metadata only)"
    )

    parsed = parser.parse_args(args)
    input_path = Path(parsed.input)

    engine = CORExtractionEngine(output_dir=parsed.output_dir)
    result = engine.extract(input_file=input_path, document_id=parsed.doc_id)

    if result.status == ExtractionStatus.SUCCESS:
        print("\nCOR EXTRACTION COMPLETE\n")
        print("Engine:")
        print("COR\n")
        print("Input:")
        print(f"{input_path.name}\n")
        print("Status:")
        print("SUCCESS\n")
        print("Artifact:")
        print(f"{result.raw_file_id}\n")
        print("Pages:")
        print(f"{result.pages_processed}\n")
        print("Characters:")
        print(f"{result.characters_extracted}\n")
        print("Processing time:")
        print(f"{result.processing_time_ms} ms\n")

        if parsed.print_text and result.raw_text:
            print("--- RAW EXTRACTED TEXT ---")
            print(result.raw_text)

        sys.exit(0)
    else:
        print("\nCOR EXTRACTION FAILED\n", file=sys.stderr)
        print("Engine:", file=sys.stderr)
        print("COR\n", file=sys.stderr)
        print("Input:", file=sys.stderr)
        print(f"{input_path.name}\n", file=sys.stderr)
        print("Status:", file=sys.stderr)
        print("FAILED\n", file=sys.stderr)
        print("Error Code:", file=sys.stderr)
        print(f"{result.error_code}\n", file=sys.stderr)
        print("Message:", file=sys.stderr)
        print(f"{result.error_message}\n", file=sys.stderr)
        print("Processing time:", file=sys.stderr)
        print(f"{result.processing_time_ms} ms\n", file=sys.stderr)
        sys.exit(1)



if __name__ == "__main__":
    run_cli()
