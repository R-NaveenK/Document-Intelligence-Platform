import json
from pathlib import Path
from typing import Optional

from app.models.validation_result import ValidationReport


def export_report_to_json(report: ValidationReport, output_path: Path) -> Path:
    """Exports ValidationReport to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, indent=2)
    return output_path


def export_report_to_excel(report: ValidationReport, output_path: Path) -> Path:
    """Exports ValidationReport to Excel .xlsx workbook."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Validation Report"

        # Headers
        ws.append(["VALIDATION REPORT SUMMARY"])
        ws.append(["Document ID", report.document_id])
        ws.append(["Risk Score", report.risk.score])
        ws.append(["Risk Level", report.risk.level])
        ws.append(["Final Decision", report.routing.decision])
        ws.append(["Reason", report.routing.reason])
        ws.append([])  # Blank row

        # Results Table Header
        ws.append(["Phase #", "Validation Phase", "Status", "Severity", "Risk Points", "Reason / Diagnostics"])

        for idx, res in enumerate(report.validation_results, 1):
            ws.append([
                idx,
                res.validator.upper(),
                res.status.value,
                res.severity.value if res.status.value != "PASS" else "-",
                f"+{res.risk_points}",
                res.message,
            ])

        wb.save(str(output_path))
        return output_path
    except Exception as exc:
        # Fallback simple text-based excel/csv if openpyxl fails
        with open(output_path.with_suffix(".csv"), "w", encoding="utf-8") as f:
            f.write(f"Document ID,{report.document_id}\n")
            f.write(f"Risk Score,{report.risk.score}\n")
            f.write(f"Decision,{report.routing.decision}\n")
        return output_path.with_suffix(".csv")


def export_report_to_pdf(report: ValidationReport, output_path: Path) -> Path:
    """Exports ValidationReport to PDF document using ReportLab."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        doc = SimpleDocTemplate(str(output_path), pagesize=letter)
        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "ReportTitle",
            parent=styles["Heading1"],
            fontSize=18,
            textColor=colors.HexColor("#003366"),
            spaceAfter=12,
        )

        story.append(Paragraph("DOCUMENT VALIDATION REPORT", title_style))
        story.append(Spacer(1, 8))

        # Metadata
        story.append(Paragraph(f"<b>Document ID:</b> {report.document_id}", styles["Normal"]))
        story.append(Paragraph(f"<b>Processed At:</b> {report.processed_at}", styles["Normal"]))
        story.append(Spacer(1, 12))

        # Table data
        table_data = [["Phase #", "Validator", "Status", "Severity", "Points", "Diagnostics"]]
        for idx, res in enumerate(report.validation_results, 1):
            table_data.append([
                str(idx),
                res.validator.upper(),
                res.status.value,
                res.severity.value if res.status.value != "PASS" else "-",
                f"+{res.risk_points}",
                res.message[:40] + ("..." if len(res.message) > 40 else ""),
            ])

        t = Table(table_data, colWidths=[40, 80, 60, 60, 45, 200])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#003366")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(t)
        story.append(Spacer(1, 16))

        # Risk Analysis & Routing
        story.append(Paragraph(f"<b>Risk Score:</b> {report.risk.score} / 100 ({report.risk.level})", styles["Normal"]))
        dec_color = "#008000" if report.routing.decision == "AUTO_PROCESS" else "#CC0000"
        story.append(Paragraph(f"<b>Final Decision:</b> <font color='{dec_color}'><b>{report.routing.decision}</b></font>", styles["Normal"]))
        story.append(Paragraph(f"<b>Reason:</b> {report.routing.reason}", styles["Normal"]))

        doc.build(story)
        return output_path

    except Exception:
        # Fallback text file if ReportLab is unavailable
        txt_path = output_path.with_suffix(".txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(f"DOCUMENT VALIDATION REPORT\nDocument: {report.document_id}\n")
            f.write(f"Risk Score: {report.risk.score}\nDecision: {report.routing.decision}\n")
        return txt_path


def export_validation_report(report: ValidationReport, format_type: str, output_dir: Path = Path("reports")) -> Path:
    """Exports validation report to requested format: 'pdf', 'excel', 'json', 'txt'."""
    format_clean = format_type.lower().strip()
    doc_id_clean = report.document_id.replace("/", "_").replace("\\", "_")

    if format_clean in ("pdf", ".pdf"):
        return export_report_to_pdf(report, output_dir / f"report_{doc_id_clean}.pdf")
    elif format_clean in ("excel", "xlsx", ".xlsx"):
        return export_report_to_excel(report, output_dir / f"report_{doc_id_clean}.xlsx")
    elif format_clean in ("json", ".json"):
        return export_report_to_json(report, output_dir / f"report_{doc_id_clean}.json")
    else:
        # Default text export
        txt_path = output_dir / f"report_{doc_id_clean}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(f"DOCUMENT VALIDATION REPORT\nDocument: {report.document_id}\n")
            f.write(f"Risk Score: {report.risk.score}\nDecision: {report.routing.decision}\n")
        return txt_path
