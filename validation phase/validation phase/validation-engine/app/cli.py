import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Force UTF-8 output encoding for Windows legacy console compatibility
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from rich.console import Console

from app.models.document import BaseDocument
from app.models.validation_result import ValidationReport, ValidationStatus
from app.repositories.memory import InMemoryRepository
from app.validation.engine import ValidationEngine

console = Console(highlight=False)


def load_json_file(file_path: Path) -> BaseDocument:
    if not file_path.exists():
        raise FileNotFoundError(f"Input JSON file not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    doc_id = data.get("document_id") or file_path.stem.upper()
    doc_type = data.get("document_type", "invoice")
    return BaseDocument(
        document_id=doc_id,
        document_type=doc_type,
        raw_data=data,
    )


def clean_json_string(raw_str: str) -> str:
    cleaned = raw_str.strip()
    # Strip outer single or double quotes if copied with surrounding shell quotes
    if (cleaned.startswith("'") and cleaned.endswith("'")) or (cleaned.startswith('"') and cleaned.endswith('"')):
        cleaned = cleaned[1:-1].strip()
    # Unescape backslash escaped quotes if copied from shell commands
    cleaned = cleaned.replace('\\"', '"')

    # Auto-repair if opening brace '{' was truncated during copy-paste
    if not cleaned.startswith("{") and (cleaned.endswith("}") or "}" in cleaned):
        cleaned = "{" + cleaned

    return cleaned


def load_json_string(json_str: str) -> BaseDocument:
    cleaned_str = clean_json_string(json_str)
    data = json.loads(cleaned_str)
    doc_id = data.get("document_id") or data.get("invoice_number") or "TERMINAL-DOC"
    doc_type = data.get("document_type", "invoice")
    return BaseDocument(
        document_id=doc_id,
        document_type=doc_type,
        raw_data=data,
    )


def format_status_badge(status: ValidationStatus) -> str:
    if status == ValidationStatus.PASS:
        return "[bold green]✅ PASS[/bold green]"
    elif status == ValidationStatus.FAIL:
        return "[bold red]❌ FAIL[/bold red]"
    else:
        return "[bold yellow]⚠️ WARNING[/bold yellow]"


def render_report_to_terminal(report: ValidationReport) -> None:
    console.print("\n" + "=" * 50, style="bold cyan")
    console.print("DOCUMENT VALIDATION REPORT", style="bold white", justify="left")
    console.print("=" * 50, style="bold cyan")

    console.print(f"\nDocument: [bold yellow]{report.document_id}[/bold yellow]")

    validator_titles = {
        "arithmetic": "1. ARITHMETIC VALIDATION",
        "format": "2. FORMAT VALIDATION",
        "duplicate": "3. DUPLICATE VALIDATION",
        "date": "4. DATE VALIDATION",
    }

    for res in report.validation_results:
        title = validator_titles.get(res.validator, res.validator.upper())
        console.print("\n" + "-" * 50, style="dim")
        console.print(f"[bold]{title}[/bold]")
        console.print("-" * 50, style="dim")

        badge = format_status_badge(res.status)
        console.print(f"Status: {badge}")

        if res.status != ValidationStatus.PASS:
            console.print(f"Severity: [bold]{res.severity.value}[/bold]")

        console.print(f"Risk Points: [bold]+{res.risk_points}[/bold]")

        details = res.details or {}

        if res.validator == "arithmetic" and res.status != ValidationStatus.PASS:
            if "expected" in details:
                console.print(f"Expected Total: ₹{details['expected']:,.2f}")
            if "actual" in details and details["actual"] is not None:
                console.print(f"Actual Total: ₹{details['actual']:,.2f}")
            if "difference" in details and details["difference"] is not None:
                console.print(f"Difference: ₹{details['difference']:,.2f}")
            if "percentage_difference" in details and details["percentage_difference"] is not None:
                console.print(f"Difference: {details['percentage_difference']}%")

        if res.validator == "duplicate" and res.status != ValidationStatus.PASS:
            if "highest_similarity" in details:
                sim_pct = int(details["highest_similarity"] * 100)
                console.print(f"Similarity: {sim_pct}%")
            if "matched_document_id" in details and details["matched_document_id"]:
                console.print(f"Possible matching document: {details['matched_document_id']}")

        if res.message:
            console.print(f"\nReason:\n{res.message}")

    # RISK ANALYSIS SECTION
    console.print("\n" + "=" * 50, style="bold cyan")
    console.print("RISK ANALYSIS", style="bold white")
    console.print("=" * 50, style="bold cyan")

    r_score = report.risk.score
    r_level = report.risk.level
    level_style = "bold green" if r_level == "LOW" else ("bold yellow" if r_level == "MEDIUM" else "bold red")

    console.print(f"\nRisk Score: [bold]{r_score} / 100[/bold]")
    console.print(f"Risk Level: [{level_style}]{r_level}[/{level_style}]")

    # FINAL ROUTING SECTION
    console.print("\n" + "=" * 50, style="bold cyan")
    console.print("FINAL ROUTING", style="bold white")
    console.print("=" * 50, style="bold cyan")

    dec = report.routing.decision
    if dec == "AUTO_PROCESS":
        console.print("\n[bold green]✅ AUTO_PROCESS[/bold green]")
    else:
        console.print("\n[bold red]🚨 HUMAN REVIEW REQUIRED[/bold red]")

    console.print(f"\nReason:\n{report.routing.reason}")
    console.print("=" * 50 + "\n", style="bold cyan")


def run_json_string_validation(json_str: str, repository: Optional[InMemoryRepository] = None) -> ValidationReport:
    repo = repository or InMemoryRepository()
    doc = load_json_string(json_str)
    repo.save_document(doc)
    engine = ValidationEngine()
    report = engine.process_document(doc, context={"repository": repo})
    render_report_to_terminal(report)
    return report


def read_multiline_input() -> str:
    lines = []
    empty_lines_count = 0
    while True:
        try:
            line = input()
            if line.strip().upper() == "DONE":
                break
            if line.strip() == "":
                empty_lines_count += 1
                if empty_lines_count >= 2 or len(lines) > 0:
                    break
            else:
                empty_lines_count = 0

            lines.append(line)

            full_text = "\n".join(lines).strip()
            if full_text.endswith("}"):
                try:
                    json.loads(clean_json_string(full_text))
                    break
                except Exception:
                    pass

        except (EOFError, KeyboardInterrupt):
            break
    return "\n".join(lines).strip()


def run_paste_mode() -> Optional[ValidationReport]:
    console.print("\n[bold cyan]=== PASTE STRUCTURED JSON INPUT ===[/bold cyan]")
    console.print("Paste your full JSON object below and type 'done' or press ENTER:\n")
    try:
        user_input = read_multiline_input()
        if not user_input:
            console.print("[bold red]No input received.[/bold red]")
            return None
        return run_json_string_validation(user_input)
    except json.JSONDecodeError as err:
        console.print(f"\n[bold red]Invalid JSON format error:[/bold red] {err}")
        console.print("[dim]Tip: Ensure your JSON starts with '{' and ends with '}' with double quotes around key names.[/dim]")
        return None
    except Exception as exc:
        console.print(f"\n[bold red]Error processing input:[/bold red] {exc}")
        return None


def run_interactive_wizard() -> ValidationReport:
    console.print("\n[bold cyan]=== INTERACTIVE STRUCTURED DATA FORM ===[/bold cyan]\n")

    doc_id = input("Enter Document ID / Invoice Number [INV-1001]: ").strip() or "INV-1001"
    doc_type = input("Enter Document Type [invoice]: ").strip() or "invoice"
    inv_date = input("Enter Invoice Date (YYYY-MM-DD) [2026-09-02]: ").strip() or "2026-09-02"
    vendor = input("Enter Vendor Name [ABC Suppliers Pvt Ltd]: ").strip() or "ABC Suppliers Pvt Ltd"
    gst = input("Enter GST Number [33ABCDE1234F1Z5]: ").strip() or "33ABCDE1234F1Z5"

    qty_str = input("Enter Quantity [10]: ").strip() or "10"
    price_str = input("Enter Unit Price (₹) [5000]: ").strip() or "5000"
    subtotal_str = input("Enter Subtotal (₹) [50000]: ").strip() or "50000"
    tax_str = input("Enter Tax (₹) [9000]: ").strip() or "9000"
    total_str = input("Enter Total Amount (₹) [59000]: ").strip() or "59000"

    try:
        qty = float(qty_str)
        unit_price = float(price_str)
        subtotal = float(subtotal_str)
        tax = float(tax_str)
        total_amount = float(total_str)
    except ValueError:
        qty, unit_price, subtotal, tax, total_amount = 10, 5000, 50000, 9000, 59000

    data = {
        "document_id": doc_id,
        "document_type": doc_type,
        "invoice_number": doc_id,
        "invoice_date": inv_date,
        "vendor_name": vendor,
        "gst_number": gst,
        "quantity": qty,
        "unit_price": unit_price,
        "subtotal": subtotal,
        "tax": tax,
        "total_amount": total_amount,
    }

    raw_json = json.dumps(data)
    return run_json_string_validation(raw_json)


from app.utils.document_loader import load_document_from_file
from app.utils.exporter import export_validation_report


def run_cli_validation(
    file_paths: List[Path],
    repository: Optional[InMemoryRepository] = None,
    export_format: Optional[str] = None,
) -> List[ValidationReport]:
    repo = repository or InMemoryRepository()

    docs = []
    for fp in file_paths:
        doc = load_document_from_file(fp)
        repo.save_document(doc)
        docs.append(doc)

    engine = ValidationEngine()
    context = {"repository": repo}

    reports = []
    for doc in docs:
        report = engine.process_document(doc, context=context)
        render_report_to_terminal(report)

        if export_format:
            out_file = export_validation_report(report, export_format)
            console.print(f"[bold green]Exported report to ({export_format.upper()}):[/bold green] {out_file}")

        reports.append(report)
    return reports

