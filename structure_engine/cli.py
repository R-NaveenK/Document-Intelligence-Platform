import argparse
import sys
import json

# Ensure UTF-8 output encoding for Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.engine import StructuringEngine
from app.models.extraction_input import RawExtractionInput

def run_cli():
    parser = argparse.ArgumentParser(
        description="Structuring Engine CLI Tool - Process persisted raw extraction files into structured JSON."
    )
    parser.add_argument(
        "--doc-id", "-d", type=str, help="Document ID of persisted raw extraction artifact (e.g. 'doc_20260903_001')"
    )
    parser.add_argument(
        "--request", "-r", type=str, help="Natural language request string e.g. 'Extract invoice number, total amount and items table'"
    )
    parser.add_argument(
        "--schema", "-s", type=str, help="JSON string or path to schema JSON file"
    )
    parser.add_argument(
        "--file", "-f", type=str, help="Explicit path to raw artifact file on disk"
    )
    parser.add_argument(
        "--text", "-t", type=str, help="Direct in-memory raw text (optional, backward compatibility)"
    )

    args = parser.parse_args()
    engine = StructuringEngine()

    doc_id = args.doc_id
    artifact_file = args.file
    request_text = args.request
    schema_arg = args.schema
    raw_text = args.text

    # Parse schema if provided as arg
    user_schema = None
    if schema_arg:
        try:
            if schema_arg.endswith(".json") and Path(schema_arg).is_file():
                with open(schema_arg, "r", encoding="utf-8") as sf:
                    user_schema = json.load(sf)
            else:
                user_schema = json.loads(schema_arg)
        except Exception as e:
            print(f"[!] Error parsing schema: {e}")
            sys.exit(1)

    # Interactive loop if neither doc_id, file, nor text is provided
    while True:
        curr_doc_id = doc_id
        curr_file = artifact_file
        curr_request = request_text
        curr_raw = raw_text

        if not curr_doc_id and not curr_file and not curr_raw:
            print("\n" + "="*60)
            print("       STRUCTURING ENGINE - PERSISTED ARTIFACT CLI        ")
            print("="*60)
            print("Step 1: Enter Document ID (stored in data/raw_extraction/)")
            print("Examples:")
            print("  - doc_20260903_001")
            print("  - doc_large_50page")
            print("  - sample_invoice_extraction")
            print("  (Or type 'RAW' to manually paste text)")
            print("-"*60)
            user_doc_input = input("Document ID or File Path:\n> ").strip().strip('"').strip("'")
            
            if user_doc_input.upper() == "RAW":
                print("\nPaste raw text below (type 'END' on a new line to finish):")
                raw_lines = []
                while True:
                    try:
                        line = input()
                        if line.strip().upper() == "END":
                            break
                        raw_lines.append(line)
                    except EOFError:
                        break
                curr_raw = "\n".join(raw_lines).strip()
            elif "/" in user_doc_input or "\\" in user_doc_input or user_doc_input.endswith(".txt") or user_doc_input.endswith(".json"):
                curr_file = user_doc_input
                curr_doc_id = None
            else:
                curr_doc_id = user_doc_input
                curr_file = None

        if not curr_request and not user_schema:
            print("\n" + "-"*60)
            print("Step 2: Enter requested fields or natural language prompt.")
            print("Examples:")
            print("  - invoice number, total amount, customer name, items")
            print("  - billing reference, amount payable, buyer organization")
            print("  - Extract invoice number and amount payable")
            print("-"*60)
            curr_request = input("User Request / Required Fields:\n> ").strip()

        if not (curr_doc_id or curr_file or curr_raw):
            print("\n[!] Error: Document ID or artifact file is required.")
            if args.doc_id or args.file or args.text:
                sys.exit(1)
            continue

        if not curr_request and not user_schema:
            print("\n[!] Error: User request or schema is required.")
            if args.request or args.schema:
                sys.exit(1)
            continue

        print("\n[*] Resolving artifact and processing with Structuring Engine...\n")

        try:
            response = engine.structure(
                document_id=curr_doc_id,
                artifact_path=curr_file,
                raw_extraction=curr_raw,
                user_request=curr_request,
                user_schema=user_schema
            )

            print("="*60)
            print("               STRUCTURED DATA (JSON)                 ")
            print("="*60)
            print(json.dumps(response.structured_data, indent=2, ensure_ascii=False))

            print("\n" + "="*60)
            print("             FIELD EXTRACTION DETAILS                 ")
            print("="*60)
            for f_key, detail in response.field_details.items():
                val_display = repr(detail.value) if detail.value is not None else "null"
                status_symbol = "[✓]" if detail.status == "found" else ("[?]" if detail.status == "ambiguous" else "[✗]")
                print(f"{status_symbol} {f_key:<22} : {val_display}")
                print(f"    Status: {detail.status:<10} | Confidence: {detail.confidence:.2f} | Evidence: {detail.evidence or 'N/A'}")

            print("\n" + "-"*60)
            print(f"Summary: Found: {response.summary.found_count}/{response.summary.total_requested} | "
                  f"Missing: {response.summary.not_found_count} | "
                  f"Ambiguous: {response.summary.ambiguous_count} | "
                  f"Latency: {response.processing_time_ms:.2f} ms")
            print("="*60 + "\n")

        except Exception as e:
            print(f"\n[!] Structuring Error: {e}\n")

        # If run via CLI flags, don't loop
        if args.request or args.text or args.file:
            break

        # Ask to test another
        again = input("Do you want to test another document? (y/n) [default: y]: ").strip().lower()
        if again in ["n", "no", "exit", "q", "quit"]:
            print("\nExiting Structuring Engine CLI. Goodbye!\n")
            break
        
        request_text = None
        raw_text = None

if __name__ == "__main__":
    run_cli()
