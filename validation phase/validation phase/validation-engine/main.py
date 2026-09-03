import argparse
import sys
from pathlib import Path

from fastapi import FastAPI
import uvicorn
from rich.console import Console

from app.api.routes import router as api_router
from app.cli import (
    run_cli_validation,
    run_interactive_wizard,
    run_json_string_validation,
    run_paste_mode,
)
from app.config.settings import settings
from app.utils.exporter import export_validation_report

console = Console(highlight=False)

app = FastAPI(
    title=settings.APP_NAME,
    description="Deterministic Open-Source Validation Engine Module for Intelligent Document Processing",
    version="1.0.0",
)

app.include_router(api_router)


def main():
    parser = argparse.ArgumentParser(
        description="Validation Engine CLI for Multi-Format Intelligent Document Processing"
    )
    parser.add_argument(
        "-i",
        "--input",
        action="append",
        type=str,
        help="Path to input document (JSON, PDF, XLSX, CSV, TXT, YAML, MD).",
    )
    parser.add_argument(
        "-j",
        "--json",
        type=str,
        help="Pass raw structured JSON string directly on command line.",
    )
    parser.add_argument(
        "-p",
        "--paste",
        action="store_true",
        help="Paste structured payload directly into terminal.",
    )
    parser.add_argument(
        "-e",
        "--export",
        type=str,
        choices=["pdf", "excel", "xlsx", "json", "txt"],
        help="Export validation report to requested file format (pdf, excel, json, txt).",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Interactive step-by-step form wizard in terminal.",
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="Start the FastAPI web server.",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host address for FastAPI server (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port number for FastAPI server (default: 8000).",
    )

    args = parser.parse_args()

    if args.server:
        print(f"Starting Validation Engine FastAPI server on http://{args.host}:{args.port}...")
        uvicorn.run("main:app", host=args.host, port=args.port, reload=True)
        sys.exit(0)

    if args.json:
        report = run_json_string_validation(args.json)
        if args.export:
            out_file = export_validation_report(report, args.export)
            console.print(f"[bold green]Exported report to ({args.export.upper()}):[/bold green] {out_file}")
        sys.exit(0)

    if args.paste:
        report = run_paste_mode()
        if report and args.export:
            out_file = export_validation_report(report, args.export)
            console.print(f"[bold green]Exported report to ({args.export.upper()}):[/bold green] {out_file}")
        sys.exit(0)

    if args.interactive:
        report = run_interactive_wizard()
        if args.export:
            out_file = export_validation_report(report, args.export)
            console.print(f"[bold green]Exported report to ({args.export.upper()}):[/bold green] {out_file}")
        sys.exit(0)

    if args.input:
        input_paths = [Path(p) for p in args.input]
        run_cli_validation(input_paths, export_format=args.export)
        sys.exit(0)

    # Interactive Terminal Selection Menu if no arguments passed
    console.print("\n" + "=" * 50, style="bold cyan")
    console.print("VALIDATION ENGINE — MULTI-FORMAT INPUT & EXPORT", style="bold white", justify="left")
    console.print("=" * 50, style="bold cyan")
    console.print("Select how you want to provide structured document data:\n")
    console.print("  1. Paste / Enter Raw JSON String")
    console.print("  2. Interactive Step-by-Step Form Prompt")
    console.print("  3. Run Sample Dataset (data/valid_invoice.json)")
    console.print("  4. Exit\n")

    try:
        raw_choice = input("Choose input option (1-4) [1]: ").strip()
        choice = raw_choice if raw_choice in ("1", "2", "3", "4") else "1"
    except (KeyboardInterrupt, EOFError):
        sys.exit(0)

    if choice == "1":
        report = run_paste_mode()
    elif choice == "2":
        report = run_interactive_wizard()
    elif choice == "3":
        sample_path = Path("data/valid_invoice.json")
        reports = run_cli_validation([sample_path])
        report = reports[0] if reports else None
    else:
        sys.exit(0)

    # Ask if user wants to export the report
    if report:
        try:
            exp_choice = input("\nWould you like to export this report? (pdf/excel/json/no) [no]: ").strip().lower()
            if exp_choice in ("pdf", "excel", "xlsx", "json", "txt"):
                out_file = export_validation_report(report, exp_choice)
                console.print(f"[bold green]Successfully exported report to ({exp_choice.upper()}):[/bold green] {out_file}\n")
        except (KeyboardInterrupt, EOFError):
            pass


if __name__ == "__main__":
    main()
