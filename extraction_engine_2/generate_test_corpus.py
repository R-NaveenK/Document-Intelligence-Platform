"""Generate the comprehensive test corpus (Section 25: Items A through L) for the COR extraction engine."""
import io
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import pymupdf as fitz
import docx

CORPUS_DIR = Path("./test_corpus")
CORPUS_DIR.mkdir(parents=True, exist_ok=True)

# Common realistic business document data
COMMON_DATA = {
    "bill_no": "INV-2026-0098",
    "bill_to": "ABC INDUSTRIES LTD",
    "address": "45 Industrial Layout, Whitefield, Bengaluru - 560066",
    "gstin": "29AAACB1234C1Z6",
    "pan": "AAACB1234C",
    "cin": "U72200KA2015PTC081234",
    "ifsc": "HDFC0001234",
    "account_no": "50200012345678",
    "hsn_1": "8471",
    "hsn_2": "847160",
    "date": "02-09-2026",
    "item_1": "Dell Latitude 5440 Laptop",
    "item_1_qty": "5",
    "item_1_price": "58500.00",
    "item_1_total": "292500.00",
    "item_2": "Logitech MX Mechanical Keyboard",
    "item_2_qty": "10",
    "item_2_price": "14500.00",
    "item_2_total": "145000.00",
    "grand_total": "Rs. 48,500",
    "full_total": "Rs. 437,500.00",
    "unicode_total": "₹48,500.00",
}


def draw_invoice_canvas(data: dict, width: int = 750, height: int = 550, noise: bool = False, rotate: float = 0.0) -> Image.Image:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    lines = [
        ("TAX INVOICE", 30, 25),
        (f"Bill No: {data['bill_no']}", 30, 60),
        (f"Date: {data['date']}", 30, 85),
        (f"Bill To: {data['bill_to']}", 30, 120),
        (data['address'], 30, 145),
        (f"GSTIN: {data['gstin']} | PAN: {data['pan']}", 30, 170),
        (f"CIN: {data['cin']} | IFSC: {data['ifsc']}", 30, 195),
        ("ITEMS & SERVICES:", 30, 230),
        (f"1. HSN: {data['hsn_1']} | {data['item_1']} - Qty: {data['item_1_qty']} - Rate: {data['item_1_price']}", 30, 260),
        (f"2. HSN: {data['hsn_2']} | {data['item_2']} - Qty: {data['item_2_qty']} - Rate: {data['item_2_price']}", 30, 290),
        (f"Grand Total: {data['grand_total']}", 30, 340),
        (f"Account: {data['account_no']} at HDFC Bank.", 30, 380),
        ("Payment terms: Net 30 days. Contact: support@techsolutions.com", 30, 410),
    ]

    for text, x, y in lines:
        draw.text((x, y), text, fill=(0, 0, 0))

    if noise:
        # Add slight noise & blur for low-quality scan
        img = img.filter(ImageFilter.GaussianBlur(radius=0.7))

    if rotate != 0.0:
        img = img.rotate(rotate, expand=True, fillcolor=(255, 255, 255))

    return img


def generate_corpus():
    print("Generating comprehensive test corpus (Items A through L)...")

    # A. Invoice PDF (digital text)
    txt_content = (
        "TAX INVOICE\n\n"
        f"Bill No:\n{COMMON_DATA['bill_no']}\n\n"
        f"Bill To:\n{COMMON_DATA['bill_to']}\n"
        f"{COMMON_DATA['address']}\n"
        f"GSTIN: {COMMON_DATA['gstin']}\n"
        f"PAN: {COMMON_DATA['pan']}\n"
        f"CIN: {COMMON_DATA['cin']}\n"
        f"IFSC: {COMMON_DATA['ifsc']}\n"
        f"Account: {COMMON_DATA['account_no']}\n\n"
        f"Date:\n{COMMON_DATA['date']}\n\n"
        "Items\n\n"
        f"{COMMON_DATA['item_1']}\n{COMMON_DATA['item_1_qty']}\n{COMMON_DATA['item_1_price']}\n\n"
        f"{COMMON_DATA['item_2']}\n{COMMON_DATA['item_2_qty']}\n{COMMON_DATA['item_2_price']}\n\n"
        f"Grand Total:\n{COMMON_DATA['grand_total']}\n"
    )
    doc_a = fitz.open()
    pa = doc_a.new_page()
    pa.insert_text((50, 50), txt_content, fontsize=11)
    doc_a.save(CORPUS_DIR / "A_invoice_digital.pdf")
    doc_a.close()

    # B. Scanned invoice PDF
    canvas_b = draw_invoice_canvas(COMMON_DATA)
    buf_b = io.BytesIO()
    canvas_b.save(buf_b, format="PNG")
    buf_b.seek(0)
    doc_b = fitz.open()
    pb = doc_b.new_page(width=canvas_b.width, height=canvas_b.height)
    pb.insert_image(fitz.Rect(0, 0, canvas_b.width, canvas_b.height), stream=buf_b.read())
    doc_b.save(CORPUS_DIR / "B_invoice_scanned.pdf")
    doc_b.close()

    # C. Invoice PNG
    canvas_c = draw_invoice_canvas(COMMON_DATA)
    canvas_c.save(CORPUS_DIR / "C_invoice.png")

    # D. Invoice JPG
    canvas_d = draw_invoice_canvas(COMMON_DATA)
    canvas_d.save(CORPUS_DIR / "D_invoice.jpg", "JPEG")

    # E. Business DOCX (with table & embedded stamp image)
    d = docx.Document()
    d.add_heading("ENTERPRISE PURCHASE AGREEMENT & INVOICE", level=1)
    d.add_paragraph(f"Bill No: {COMMON_DATA['bill_no']}")
    d.add_paragraph(f"Bill To: {COMMON_DATA['bill_to']}")
    d.add_paragraph(f"GSTIN: {COMMON_DATA['gstin']} | PAN: {COMMON_DATA['pan']}")
    tbl = d.add_table(rows=1, cols=4)
    hdr = tbl.rows[0].cells
    hdr[0].text = "Item Description"
    hdr[1].text = "HSN Code"
    hdr[2].text = "Qty"
    hdr[3].text = "Rate (INR)"
    r1 = tbl.add_row().cells
    r1[0].text = COMMON_DATA["item_1"]
    r1[1].text = COMMON_DATA["hsn_1"]
    r1[2].text = COMMON_DATA["item_1_qty"]
    r1[3].text = COMMON_DATA["item_1_price"]
    r2 = tbl.add_row().cells
    r2[0].text = COMMON_DATA["item_2"]
    r2[1].text = COMMON_DATA["hsn_2"]
    r2[2].text = COMMON_DATA["item_2_qty"]
    r2[3].text = COMMON_DATA["item_2_price"]
    d.add_paragraph(f"Grand Total: {COMMON_DATA['grand_total']}")

    # Add embedded stamp image with OCRable text
    stamp_img = Image.new("RGB", (300, 80), color=(240, 240, 240))
    sdraw = ImageDraw.Draw(stamp_img)
    sdraw.text((10, 10), "APPROVED FOR PAYMENT", fill=(0, 120, 0))
    sdraw.text((10, 35), "AUTHORIZATION CODE: AUTH-9988", fill=(0, 120, 0))
    sdraw.text((10, 55), "OFFICER: R. SHARMA", fill=(0, 120, 0))
    stamp_buf = io.BytesIO()
    stamp_img.save(stamp_buf, format="PNG")
    stamp_buf.seek(0)
    d.add_paragraph("Approval Stamp:")
    d.add_picture(stamp_buf, width=docx.shared.Inches(3))
    d.save(CORPUS_DIR / "E_business.docx")

    # F. Legacy DOC (OLE2 compound binary file with UTF-16LE text stream)
    doc_f_bytes = (
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + (b"\x00" * 504) +
        "BILL OF SUPPLY\r\n".encode("utf-16le") +
        f"Bill No: {COMMON_DATA['bill_no']}\r\n".encode("utf-16le") +
        f"Bill To: {COMMON_DATA['bill_to']}\r\n".encode("utf-16le") +
        f"GSTIN: {COMMON_DATA['gstin']}\r\n".encode("utf-16le") +
        f"Grand Total: {COMMON_DATA['grand_total']}\r\n".encode("utf-16le") +
        (b"\x00" * 256)
    )
    (CORPUS_DIR / "F_legacy.doc").write_bytes(doc_f_bytes)

    # G. Plain TXT
    (CORPUS_DIR / "G_plain.txt").write_text(txt_content, encoding="utf-8")

    # H. Multi-page PDF
    doc_h = fitz.open()
    # Page 1
    p1 = doc_h.new_page()
    p1.insert_text((50, 50), f"ANNUAL OPERATIONS REPORT\nCompany: ABC INDUSTRIES LTD\nDate: {COMMON_DATA['date']}\nSection 1: General Business Review and Financial Overview.")
    # Page 2
    p2 = doc_h.new_page()
    p2.insert_text((50, 50), f"INVOICE & BALANCE SUMMARY\nBill No: {COMMON_DATA['bill_no']}\nGrand Total: {COMMON_DATA['grand_total']}\nGSTIN: {COMMON_DATA['gstin']}")
    doc_h.save(CORPUS_DIR / "H_multipage.pdf")
    doc_h.close()

    # I. Document with tables (PDF table layout)
    doc_i = fitz.open()
    pi = doc_i.new_page()
    table_text = (
        "QUARTERLY ITEM PROCUREMENT SCHEDULE\n\n"
        "SL | Item Description | HSN | Quantity | Unit Price | Total Amount\n"
        "-----------------------------------------------------------------------\n"
        f"01 | {COMMON_DATA['item_1']} | 8471 | 5 | 58,500.00 | 292,500.00\n"
        f"02 | {COMMON_DATA['item_2']} | 8471 | 10 | 14,500.00 | 145,000.00\n"
        "-----------------------------------------------------------------------\n"
        f"Grand Total: {COMMON_DATA['grand_total']}\n"
    )
    pi.insert_text((40, 50), table_text, fontsize=10)
    doc_i.save(CORPUS_DIR / "I_document_with_tables.pdf")
    doc_i.close()

    # J. Document containing Unicode & Currency symbols
    unicode_content = (
        "INTERNATIONAL CURRENCY & MULTILINGUAL INVOICE\n\n"
        f"Bill No: {COMMON_DATA['bill_no']}\n"
        f"Bill To: {COMMON_DATA['bill_to']}\n"
        "India Branch: ₹48,500.00 (INR)\n"
        "European Branch: €550.00 (EUR)\n"
        "US Division: $600.00 (USD)\n"
        "UK Office: £480.00 (GBP)\n"
        "Japan Partner: ¥88,000 (JPY)\n"
        "Multilingual Notes: Merci beaucoup | Vielen Dank | धन्यवाद | شكرا\n"
    )
    (CORPUS_DIR / "J_unicode.txt").write_text(unicode_content, encoding="utf-8")

    # K. Document with many numbers (banking, tax identifiers, codes)
    numbers_content = (
        "STATUTORY AND FINANCIAL IDENTIFIERS REPORT\n\n"
        f"GSTIN: {COMMON_DATA['gstin']}\n"
        f"PAN: {COMMON_DATA['pan']}\n"
        f"CIN: {COMMON_DATA['cin']}\n"
        f"IFSC Code: {COMMON_DATA['ifsc']}\n"
        f"Primary Bank Account: {COMMON_DATA['account_no']}\n"
        f"HSN Codes: {COMMON_DATA['hsn_1']}, {COMMON_DATA['hsn_2']}\n"
        "Transaction ID: TXN-998877665544332211\n"
        "Tax Rate: 18.00% (CGST: 9.00%, SGST: 9.00%)\n"
        "Subtotal: Rs. 437,500.00\n"
        f"Grand Total: {COMMON_DATA['grand_total']}\n"
    )
    (CORPUS_DIR / "K_numbers.txt").write_text(numbers_content, encoding="utf-8")

    # L. Low-quality scanned document (noisy / slightly rotated)
    canvas_l = draw_invoice_canvas(COMMON_DATA, noise=True, rotate=1.0)
    canvas_l.save(CORPUS_DIR / "L_low_quality_scan.png")

    print("Corpus generated successfully in ./test_corpus:")
    for f in sorted(CORPUS_DIR.iterdir()):
        print(f" - {f.name} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    generate_corpus()
