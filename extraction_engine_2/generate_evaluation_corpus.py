"""Generate comprehensive evaluation corpus and ground_truth.json (Sections 3, 4, 10, 11, 13, 15, 17)."""
import io
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import pymupdf as fitz
import docx

BASE_DIR = Path("tests/test_documents")
PDF_DIR = BASE_DIR / "pdf"
DOC_DIR = BASE_DIR / "doc"
DOCX_DIR = BASE_DIR / "docx"
TXT_DIR = BASE_DIR / "txt"
IMG_DIR = BASE_DIR / "images"
CORRUPT_DIR = BASE_DIR / "corrupt"

for d in (PDF_DIR, DOC_DIR, DOCX_DIR, TXT_DIR, IMG_DIR, CORRUPT_DIR):
    d.mkdir(parents=True, exist_ok=True)

GROUND_TRUTH_FILE = Path("tests/ground_truth.json")

COMMON = {
    "bill_no": "INV-2026-0098",
    "customer": "ABC INDUSTRIES LTD",
    "address": "45 Industrial Layout, Whitefield, Bengaluru - 560066",
    "gstin": "29AAACB1234C1Z6",
    "pan": "AAACB1234C",
    "cin": "U72200KA2015PTC081234",
    "ifsc": "HDFC0001234",
    "account": "50200012345678",
    "date": "02-09-2026",
    "phone": "+91-9876543210",
    "laptop_item": "Dell Latitude 5440 Laptop",
    "laptop_qty": "5",
    "laptop_rate": "58500.00",
    "laptop_total": "292500.00",
    "keyboard_item": "Logitech MX Mechanical Keyboard",
    "keyboard_qty": "10",
    "keyboard_rate": "14500.00",
    "keyboard_total": "145000.00",
    "grand_total": "Rs. 48,500",
    "grand_total_unicode": "₹48,500.00",
    "auth_code": "AUTH-9988",
    "officer": "R. SHARMA",
}


def draw_canvas(width=750, height=520, noise=False, blur=False, low_res=False, rotate=0.0):
    w, h = (260, 180) if low_res else (width, height)
    img = Image.new("RGB", (w, h), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    lines = [
        ("TAX INVOICE", 20, 20),
        (f"Bill No: {COMMON['bill_no']}", 20, 50),
        (f"Date: {COMMON['date']} | Phone: {COMMON['phone']}", 20, 75),
        (f"Bill To: {COMMON['customer']}", 20, 105),
        (COMMON['address'], 20, 130),
        (f"GSTIN: {COMMON['gstin']} | PAN: {COMMON['pan']}", 20, 155),
        (f"CIN: {COMMON['cin']} | IFSC: {COMMON['ifsc']}", 20, 180),
        ("ITEMS & SERVICES:", 20, 215),
        (f"1. {COMMON['laptop_item']} - Qty: {COMMON['laptop_qty']} - Rate: {COMMON['laptop_rate']}", 20, 245),
        (f"2. {COMMON['keyboard_item']} - Qty: {COMMON['keyboard_qty']} - Rate: {COMMON['keyboard_rate']}", 20, 275),
        (f"Grand Total: {COMMON['grand_total']}", 20, 320),
        (f"Bank Account: {COMMON['account']} at HDFC Bank", 20, 360),
        ("Terms: Net 30 days. Contact: accounts@techsolutions.com", 20, 390),
    ]

    for text, x, y in lines:
        if low_res:
            draw.text((x // 3, y // 3), text, fill=(0, 0, 0))
        else:
            draw.text((x, y), text, fill=(0, 0, 0))

    if blur:
        img = img.filter(ImageFilter.GaussianBlur(radius=1.0))
    if noise:
        import numpy as np
        arr = np.array(img).astype(np.float32)
        n = np.random.normal(0, 18, arr.shape)
        arr = np.clip(arr + n, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr)

    if rotate != 0.0:
        img = img.rotate(rotate, expand=True, fillcolor=(255, 255, 255))

    return img


def build_all():
    print("Building evaluation corpus...")
    ground_truth = {}

    # 1. PDF
    # text_invoice.pdf
    text_inv_content = (
        "TAX INVOICE\n\n"
        f"Bill No:\n{COMMON['bill_no']}\n\n"
        f"Bill To:\n{COMMON['customer']}\n"
        f"{COMMON['address']}\n"
        f"GSTIN: {COMMON['gstin']}\n"
        f"PAN: {COMMON['pan']}\n"
        f"CIN: {COMMON['cin']}\n"
        f"IFSC: {COMMON['ifsc']}\n"
        f"Account: {COMMON['account']}\n\n"
        f"Date:\n{COMMON['date']}\n\n"
        f"Items:\n{COMMON['laptop_item']} - Qty: {COMMON['laptop_qty']} - Price: {COMMON['laptop_rate']}\n"
        f"{COMMON['keyboard_item']} - Qty: {COMMON['keyboard_qty']} - Price: {COMMON['keyboard_rate']}\n\n"
        f"Grand Total:\n{COMMON['grand_total']}\n"
    )
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((40, 40), text_inv_content, fontsize=10)
    pdf_text_path = PDF_DIR / "text_invoice.pdf"
    doc.save(pdf_text_path)
    doc.close()
    ground_truth[str(pdf_text_path)] = {
        "type": "PDF",
        "required_text": ["TAX INVOICE", COMMON["bill_no"], COMMON["customer"], COMMON["gstin"], COMMON["laptop_item"], COMMON["grand_total"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["pan"], COMMON["cin"], COMMON["ifsc"], COMMON["account"], COMMON["laptop_rate"]],
        "expected_pages": 1,
    }

    # scanned_invoice.pdf
    canvas = draw_canvas()
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)
    doc_scan = fitz.open()
    ps = doc_scan.new_page(width=canvas.width, height=canvas.height)
    ps.insert_image(fitz.Rect(0, 0, canvas.width, canvas.height), stream=buf.read())
    pdf_scan_path = PDF_DIR / "scanned_invoice.pdf"
    doc_scan.save(pdf_scan_path)
    doc_scan.close()
    ground_truth[str(pdf_scan_path)] = {
        "type": "PDF",
        "required_text": ["TAX INVOICE", COMMON["bill_no"], COMMON["customer"], COMMON["gstin"], COMMON["laptop_item"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["pan"], COMMON["cin"], COMMON["ifsc"], COMMON["account"]],
        "expected_pages": 1,
    }

    # mixed_pdf.pdf (Page 1 digital, Page 2 image scan)
    doc_mix = fitz.open()
    pm1 = doc_mix.new_page()
    pm1.insert_text((40, 40), f"PAGE 1 - PURCHASE AGREEMENT\nBill No: {COMMON['bill_no']}\nCustomer: {COMMON['customer']}\nDate: {COMMON['date']}", fontsize=11)
    buf.seek(0)
    pm2 = doc_mix.new_page(width=canvas.width, height=canvas.height)
    pm2.insert_image(fitz.Rect(0, 0, canvas.width, canvas.height), stream=buf.read())
    pdf_mix_path = PDF_DIR / "mixed_pdf.pdf"
    doc_mix.save(pdf_mix_path)
    doc_mix.close()
    ground_truth[str(pdf_mix_path)] = {
        "type": "PDF",
        "required_text": ["PURCHASE AGREEMENT", COMMON["bill_no"], COMMON["customer"], COMMON["gstin"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["account"]],
        "expected_pages": 2,
    }

    # multi_page.pdf (3 pages)
    doc_mp = fitz.open()
    p1 = doc_mp.new_page()
    p1.insert_text((40, 40), f"PAGE 1: VENDOR & BUYER DETAILS\nBill No: {COMMON['bill_no']}\nBill To: {COMMON['customer']}\nGSTIN: {COMMON['gstin']}\nPAN: {COMMON['pan']}")
    p2 = doc_mp.new_page()
    p2.insert_text((40, 40), f"PAGE 2: BILLABLE HARDWARE & SERVICES\nItem 1: {COMMON['laptop_item']} Qty: {COMMON['laptop_qty']} Rate: {COMMON['laptop_rate']}\nItem 2: {COMMON['keyboard_item']} Qty: {COMMON['keyboard_qty']} Rate: {COMMON['keyboard_rate']}")
    p3 = doc_mp.new_page()
    p3.insert_text((40, 40), f"PAGE 3: PAYMENT & SETTLEMENT\nGrand Total: {COMMON['grand_total']}\nBank: HDFC Bank\nAccount: {COMMON['account']}\nIFSC: {COMMON['ifsc']}")
    pdf_mp_path = PDF_DIR / "multi_page.pdf"
    doc_mp.save(pdf_mp_path)
    doc_mp.close()
    ground_truth[str(pdf_mp_path)] = {
        "type": "PDF",
        "required_text": ["PAGE 1", "PAGE 2", "PAGE 3", COMMON["bill_no"], COMMON["customer"], COMMON["grand_total"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["account"], COMMON["ifsc"]],
        "expected_pages": 3,
    }

    # complex_layout.pdf (2-column layout)
    doc_cl = fitz.open()
    pcl = doc_cl.new_page()
    col1_text = (
        "SECTION A: COMPANY INFO\n"
        "TechSolutions Pvt Ltd\n"
        "Prestige Tech Park, Bengaluru\n"
        f"GSTIN: {COMMON['gstin']}\n"
        f"CIN: {COMMON['cin']}\n"
        f"Date: {COMMON['date']}\n"
    )
    col2_text = (
        "SECTION B: CLIENT INFO\n"
        f"Client: {COMMON['customer']}\n"
        f"{COMMON['address']}\n"
        f"Bill No: {COMMON['bill_no']}\n"
        f"PAN: {COMMON['pan']}\n"
        f"Grand Total: {COMMON['grand_total']}\n"
    )
    pcl.insert_text((40, 40), col1_text, fontsize=10)
    pcl.insert_text((320, 40), col2_text, fontsize=10)
    pdf_cl_path = PDF_DIR / "complex_layout.pdf"
    doc_cl.save(pdf_cl_path)
    doc_cl.close()
    ground_truth[str(pdf_cl_path)] = {
        "type": "PDF",
        "required_text": ["SECTION A", "SECTION B", COMMON["bill_no"], COMMON["customer"], COMMON["grand_total"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["cin"], COMMON["pan"]],
        "expected_pages": 1,
    }

    # large_document.pdf (10-page stress test)
    doc_large = fitz.open()
    for idx in range(10):
        pl = doc_large.new_page()
        pl.insert_text((40, 40), f"LARGE ENTERPRISE AUDIT REPORT - VOLUME {idx+1}\nDocument Ref: AUDIT-PAGE-{idx+1:02d}\nBill Reference: {COMMON['bill_no']}\nAccount: {COMMON['account']}\nPage number: {idx+1} of 10 pages.\nDetailed corporate operational transaction logs and security ledger entries.")
    pdf_large_path = PDF_DIR / "large_document.pdf"
    doc_large.save(pdf_large_path)
    doc_large.close()
    ground_truth[str(pdf_large_path)] = {
        "type": "PDF",
        "required_text": ["PAGE 1", "PAGE 5", "PAGE 10", COMMON["bill_no"]],
        "required_numbers": [COMMON["bill_no"], COMMON["account"]],
        "expected_pages": 10,
    }

    # 2. DOC (Legacy)
    doc_bytes = (
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + (b"\x00" * 504) +
        "LEGACY ARCHIVE BILL\r\n".encode("utf-16le") +
        f"Bill No: {COMMON['bill_no']}\r\n".encode("utf-16le") +
        f"Bill To: {COMMON['customer']}\r\n".encode("utf-16le") +
        f"GSTIN: {COMMON['gstin']}\r\n".encode("utf-16le") +
        f"Account: {COMMON['account']}\r\n".encode("utf-16le") +
        f"Grand Total: {COMMON['grand_total']}\r\n".encode("utf-16le") +
        (b"\x00" * 256)
    )
    doc_path = DOC_DIR / "legacy_document.doc"
    doc_path.write_bytes(doc_bytes)
    ground_truth[str(doc_path)] = {
        "type": "DOC",
        "required_text": [COMMON["bill_no"], COMMON["customer"], COMMON["grand_total"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["account"]],
        "expected_pages": 1,
    }

    # 3. DOCX
    # business_document.docx
    d_biz = docx.Document()
    d_biz.add_heading("MASTER SERVICES AGREEMENT", level=1)
    d_biz.add_paragraph(f"Bill No: {COMMON['bill_no']}")
    d_biz.add_paragraph(f"Bill To: {COMMON['customer']}")
    d_biz.add_paragraph(f"GSTIN: {COMMON['gstin']} | PAN: {COMMON['pan']}")
    d_biz.add_paragraph(f"Primary Account: {COMMON['account']} at HDFC Bank, IFSC: {COMMON['ifsc']}")
    d_biz.add_paragraph(f"Grand Total: {COMMON['grand_total']}")
    docx_biz_path = DOCX_DIR / "business_document.docx"
    d_biz.save(docx_biz_path)
    ground_truth[str(docx_biz_path)] = {
        "type": "DOCX",
        "required_text": ["MASTER SERVICES AGREEMENT", COMMON["bill_no"], COMMON["customer"], COMMON["grand_total"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["pan"], COMMON["account"], COMMON["ifsc"]],
        "expected_pages": 1,
    }

    # table_document.docx
    d_tbl = docx.Document()
    d_tbl.add_heading("HARDWARE PROCUREMENT SCHEDULE", level=1)
    tbl = d_tbl.add_table(rows=1, cols=4)
    hdr = tbl.rows[0].cells
    hdr[0].text = "Product Name"
    hdr[1].text = "Quantity"
    hdr[2].text = "Unit Price"
    hdr[3].text = "Total Amount"
    r1 = tbl.add_row().cells
    r1[0].text = COMMON["laptop_item"]
    r1[1].text = COMMON["laptop_qty"]
    r1[2].text = COMMON["laptop_rate"]
    r1[3].text = COMMON["laptop_total"]
    r2 = tbl.add_row().cells
    r2[0].text = COMMON["keyboard_item"]
    r2[1].text = COMMON["keyboard_qty"]
    r2[2].text = COMMON["keyboard_rate"]
    r2[3].text = COMMON["keyboard_total"]
    d_tbl.add_paragraph(f"Grand Total: {COMMON['grand_total']}")
    docx_tbl_path = DOCX_DIR / "table_document.docx"
    d_tbl.save(docx_tbl_path)
    ground_truth[str(docx_tbl_path)] = {
        "type": "DOCX",
        "required_text": [COMMON["laptop_item"], COMMON["keyboard_item"], COMMON["grand_total"]],
        "required_numbers": [COMMON["laptop_qty"], COMMON["laptop_rate"], COMMON["keyboard_qty"], COMMON["keyboard_rate"]],
        "expected_pages": 1,
    }

    # image_document.docx
    d_img = docx.Document()
    d_img.add_heading("VERIFIED EXPENSE STATEMENT", level=1)
    d_img.add_paragraph(f"Bill No: {COMMON['bill_no']}")
    d_img.add_paragraph(f"Bill To: {COMMON['customer']}")
    stamp = Image.new("RGB", (320, 80), color=(240, 240, 240))
    sdraw = ImageDraw.Draw(stamp)
    sdraw.text((10, 10), "APPROVED FOR PAYMENT", fill=(0, 100, 0))
    sdraw.text((10, 35), f"CODE: {COMMON['auth_code']}", fill=(0, 100, 0))
    sdraw.text((10, 55), f"SIGNATURE: {COMMON['officer']}", fill=(0, 100, 0))
    sbuf = io.BytesIO()
    stamp.save(sbuf, format="PNG")
    sbuf.seek(0)
    d_img.add_picture(sbuf, width=docx.shared.Inches(3))
    docx_img_path = DOCX_DIR / "image_document.docx"
    d_img.save(docx_img_path)
    ground_truth[str(docx_img_path)] = {
        "type": "DOCX",
        "required_text": ["VERIFIED EXPENSE STATEMENT", COMMON["bill_no"], COMMON["customer"], "EMBEDDED IMAGE 1", "APPROVED FOR PAYMENT"],
        "required_numbers": [COMMON["bill_no"], COMMON["auth_code"]],
        "expected_pages": 1,
    }

    # 4. TXT
    # normal.txt
    txt_norm_path = TXT_DIR / "normal.txt"
    txt_norm_path.write_text(text_inv_content, encoding="utf-8")
    ground_truth[str(txt_norm_path)] = {
        "type": "TXT",
        "required_text": ["TAX INVOICE", COMMON["bill_no"], COMMON["customer"], COMMON["grand_total"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["pan"], COMMON["account"]],
        "expected_pages": 1,
    }

    # unicode.txt
    uni_content = (
        "INTERNATIONAL CURRENCY & MULTILINGUAL SETTLEMENT\n\n"
        f"Bill No: {COMMON['bill_no']}\n"
        f"Customer: {COMMON['customer']}\n"
        f"INR Total: {COMMON['grand_total_unicode']}\n"
        "EUR Amount: €550.00\n"
        "USD Amount: $600.00\n"
        "GBP Amount: £480.00\n"
        "JPY Amount: ¥88,000\n"
        "Multilingual Notes: Société Générale | Merci beaucoup | Vielen Dank | धन्यवाद | شكرا\n"
    )
    txt_uni_path = TXT_DIR / "unicode.txt"
    txt_uni_path.write_text(uni_content, encoding="utf-8")
    ground_truth[str(txt_uni_path)] = {
        "type": "TXT",
        "required_text": [COMMON["bill_no"], COMMON["customer"], "₹48,500.00", "€550.00", "$600.00", "£480.00", "¥88,000", "Société Générale"],
        "required_numbers": [COMMON["bill_no"], "48,500.00", "550.00", "600.00", "480.00", "88,000"],
        "expected_pages": 1,
    }

    # large.txt (2500 lines)
    large_lines = [f"TRANSACTION ENTRY #{i:04d} | REF: TXN-{i*13:08d} | AMOUNT: Rs. {i*100}.00 | STATUS: CLEARED" for i in range(1, 2501)]
    large_lines.insert(0, f"LARGE DATASET AUDIT DUMP | ACCOUNT: {COMMON['account']} | BILL NO: {COMMON['bill_no']}")
    txt_large_path = TXT_DIR / "large.txt"
    txt_large_path.write_text("\n".join(large_lines), encoding="utf-8")
    ground_truth[str(txt_large_path)] = {
        "type": "TXT",
        "required_text": [COMMON["bill_no"], COMMON["account"], "TRANSACTION ENTRY #0001", "TRANSACTION ENTRY #2500"],
        "required_numbers": [COMMON["bill_no"], COMMON["account"]],
        "expected_pages": 1,
    }

    # 5. Images
    # clean.png
    clean_png_path = IMG_DIR / "clean.png"
    draw_canvas().save(clean_png_path)
    ground_truth[str(clean_png_path)] = {
        "type": "PNG",
        "required_text": ["TAX INVOICE", COMMON["bill_no"], COMMON["customer"], COMMON["gstin"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["pan"], COMMON["cin"], COMMON["account"]],
        "expected_pages": 1,
    }

    # clean.jpg
    clean_jpg_path = IMG_DIR / "clean.jpg"
    draw_canvas().save(clean_jpg_path, "JPEG")
    ground_truth[str(clean_jpg_path)] = {
        "type": "JPG",
        "required_text": ["TAX INVOICE", COMMON["bill_no"], COMMON["customer"], COMMON["gstin"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"], COMMON["pan"], COMMON["cin"], COMMON["account"]],
        "expected_pages": 1,
    }

    # noisy.png
    noisy_png_path = IMG_DIR / "noisy.png"
    draw_canvas(noise=True, blur=True).save(noisy_png_path)
    ground_truth[str(noisy_png_path)] = {
        "type": "PNG",
        "required_text": ["TAX INVOICE", COMMON["customer"]],
        "required_numbers": [COMMON["bill_no"], COMMON["gstin"]],
        "expected_pages": 1,
    }

    # rotated_90.jpg
    rot90_path = IMG_DIR / "rotated_90.jpg"
    draw_canvas(rotate=90.0).save(rot90_path, "JPEG")
    ground_truth[str(rot90_path)] = {
        "type": "JPG",
        "required_text": ["TAX INVOICE", COMMON["customer"]],
        "required_numbers": [COMMON["bill_no"]],
        "expected_pages": 1,
    }

    # rotated_180.jpg
    rot180_path = IMG_DIR / "rotated_180.jpg"
    draw_canvas(rotate=180.0).save(rot180_path, "JPEG")
    ground_truth[str(rot180_path)] = {
        "type": "JPG",
        "required_text": ["TAX INVOICE", COMMON["customer"]],
        "required_numbers": [COMMON["bill_no"]],
        "expected_pages": 1,
    }

    # rotated_270.jpg
    rot270_path = IMG_DIR / "rotated_270.jpg"
    draw_canvas(rotate=270.0).save(rot270_path, "JPEG")
    ground_truth[str(rot270_path)] = {
        "type": "JPG",
        "required_text": ["TAX INVOICE", COMMON["customer"]],
        "required_numbers": [COMMON["bill_no"]],
        "expected_pages": 1,
    }

    # low_resolution.png
    low_res_path = IMG_DIR / "low_resolution.png"
    draw_canvas(low_res=True).save(low_res_path)
    ground_truth[str(low_res_path)] = {
        "type": "PNG",
        "required_text": ["INVOICE"],
        "required_numbers": [],
        "expected_pages": 1,
    }

    # 6. Corrupt & Empty Files
    (CORRUPT_DIR / "empty.txt").write_bytes(b"")
    (CORRUPT_DIR / "empty.png").write_bytes(b"")
    (CORRUPT_DIR / "corrupted.pdf").write_bytes(b"%PDF-1.4\nTRUNCATED_GARBAGE_HEADER_ONLY")
    (CORRUPT_DIR / "corrupted.jpg").write_bytes(b"\xff\xd8\xff\xe0NOT_A_VALID_JPEG_STREAM")
    (CORRUPT_DIR / "corrupted.docx").write_bytes(b"PK\x03\x04NOT_A_VALID_WORD_DOCX_ZIP")

    # Save ground_truth.json
    GROUND_TRUTH_FILE.write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")
    print(f"Ground truth written to {GROUND_TRUTH_FILE} with {len(ground_truth)} documents.")


if __name__ == "__main__":
    build_all()
