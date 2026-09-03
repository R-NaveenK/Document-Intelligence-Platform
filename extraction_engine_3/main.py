import sys
import os
import argparse
from app.engine import ExtractionEngine
from app.models.extraction_result import ExtractionStatus

def main():
    """
    CLI Entrypoint for Extraction Engine 1.
    Usage:
        python main.py <path_to_document>
        python main.py <path_to_document> --json
    """
    sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Extraction Engine 1 CLI - Extract raw text and numerical content from PDF or Image files."
    )
    parser.add_argument("document", help="Path to document file (PDF, PNG, JPG, JPEG, TIFF)")
    parser.add_argument("--json", action="store_true", help="Output full ExtractionResult JSON object")
    parser.add_argument("--doc-id", default=None, help="Optional document tracking ID")

    args = parser.parse_args()

    doc_path = os.path.abspath(args.document)
    if not os.path.exists(doc_path):
        print(f"Error: Specified document file '{args.document}' does not exist.")
        sys.exit(1)

    print("=" * 80)
    print("EXTRACTION ENGINE 1 - PROCESSING DOCUMENT")
    print("=" * 80)
    print(f"File Path : {doc_path}")

    engine = ExtractionEngine()
    result = engine.extract(
        document=doc_path,
        original_filename=os.path.basename(doc_path),
        document_id=args.doc_id
    )

    if args.json:
        print(result.model_dump_json(indent=2))
        return

    print(f"Engine ID         : {result.engine_id}")
    print(f"Engine Version    : {result.engine_version}")
    print(f"Status            : {result.status.value}")
    print(f"Document ID       : {result.document_id}")
    print(f"Raw File Path     : {result.raw_file_path or 'N/A'}")
    print(f"Raw File ID       : {result.raw_file_id or 'N/A'}")
    print(f"Pages Processed   : {result.pages_processed}")
    print(f"Processing Time   : {result.processing_time_ms} ms")
    print(f"Extraction Conf   : {result.extraction_confidence:.4f}")
    if result.failed_pages:
        print(f"Failed Pages      : {result.failed_pages}")
    if result.warnings:
        print(f"Warnings          : {result.warnings}")
    if result.errors:
        print(f"Errors            : {result.errors}")

    print("-" * 80)
    print("EXTRACTED RAW UNSTRUCTURED TEXT OUTPUT:")
    print("-" * 80)
    if result.raw_text.strip():
        print(result.raw_text)
    else:
        print("[No text extracted or document unreadable]")
    print("=" * 80)

if __name__ == "__main__":
    main()
