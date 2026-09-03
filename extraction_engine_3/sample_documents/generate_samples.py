import os
from PIL import Image, ImageDraw, ImageFont
import pymupdf

SAMPLE_DIR = os.path.dirname(os.path.abspath(__file__))

def generate_sample_files():
    """Generates synthetic test documents and ground-truth text files."""
    os.makedirs(SAMPLE_DIR, exist_ok=True)

    # 1. Digital single-page invoice
    pdf_path_1 = os.path.join(SAMPLE_DIR, "digital_invoice_1.pdf")
    gt_path_1 = os.path.join(SAMPLE_DIR, "digital_invoice_1.gt.txt")
    doc1 = pymupdf.open()
    page1 = doc1.new_page(width=595, height=842) # A4
    text_content_1 = (
        "ABC TECHNOLOGIES\n"
        "Invoice No: INV-10245\n"
        "Date: 02/09/2026\n"
        "Customer: XYZ Ltd\n"
        "GST: 33ABCDE1234F1Z5\n\n"
        "Laptop 5 RS 40,000\n"
        "Mouse 5 RS 500\n\n"
        "Subtotal: RS 82,500\n"
        "Tax: RS 0\n"
        "Total: RS 82,500"
    )
    page1.insert_text(pymupdf.Point(50, 100), text_content_1, fontsize=12)
    doc1.save(pdf_path_1)
    doc1.close()
    with open(gt_path_1, "w", encoding="utf-8") as f:
        f.write(text_content_1)

    # 2. Multi-page invoice
    pdf_path_2 = os.path.join(SAMPLE_DIR, "multipage_invoice.pdf")
    gt_path_2 = os.path.join(SAMPLE_DIR, "multipage_invoice.gt.txt")
    doc2 = pymupdf.open()
    # Page 1
    p1 = doc2.new_page(width=595, height=842)
    p1.insert_text(pymupdf.Point(50, 100), "PAGE 1: ABC TECHNOLOGIES\nInvoice No: INV-99001\nCustomer: Global Corp", fontsize=14)
    # Page 2
    p2 = doc2.new_page(width=595, height=842)
    p2.insert_text(pymupdf.Point(50, 100), "PAGE 2: ITEMIZED BILLING\nServer Rack x 2: RS 1,20,000\nTOTAL DUE: RS 1,20,000", fontsize=14)
    doc2.save(pdf_path_2)
    doc2.close()

    gt_content_2 = (
        "PAGE 1: ABC TECHNOLOGIES\nInvoice No: INV-99001\nCustomer: Global Corp\n\n"
        "[PAGE_BREAK]\n\n"
        "PAGE 2: ITEMIZED BILLING\nServer Rack x 2: RS 1,20,000\nTOTAL DUE: RS 1,20,000"
    )
    with open(gt_path_2, "w", encoding="utf-8") as f:
        f.write(gt_content_2)

    # 3. Numeric & Financial heavy document
    pdf_path_3 = os.path.join(SAMPLE_DIR, "numeric_financials.pdf")
    gt_path_3 = os.path.join(SAMPLE_DIR, "numeric_financials.gt.txt")
    doc3 = pymupdf.open()
    p3 = doc3.new_page(width=595, height=842)
    text_content_3 = (
        "FINANCIAL REPORT 2026\n"
        "Ref Code: INV-10245 vs 1O245 vs 10245\n"
        "Phone: +91 9876543210\n"
        "Tax Rate: 12.5%\n"
        "Subtotal: RS 82,500.50\n"
        "USD Total: $1,250.99\n"
        "Final Amount: RS 82,500.50"
    )
    p3.insert_text(pymupdf.Point(50, 100), text_content_3, fontsize=12)
    doc3.save(pdf_path_3)
    doc3.close()
    with open(gt_path_3, "w", encoding="utf-8") as f:
        f.write(text_content_3)

    # 4. Receipt Image PNG
    png_path = os.path.join(SAMPLE_DIR, "receipt_sample.png")
    gt_path_4 = os.path.join(SAMPLE_DIR, "receipt_sample.gt.txt")
    img = Image.new("RGB", (600, 400), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    lines = [
        "TECH SUPPLIES STORE",
        "Receipt # 88472",
        "Date: 15/08/2026",
        "-----------------------------",
        "Keyboard  1 x RS 2500",
        "Monitor   1 x RS 15000",
        "-----------------------------",
        "Total Paid: RS 17500",
        "Thank you for shopping!"
    ]
    y = 30
    for line in lines:
        draw.text((40, y), line, fill=(0, 0, 0))
        y += 35
    img.save(png_path)

    with open(gt_path_4, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    # 5. Corrupted file sample
    corrupt_path = os.path.join(SAMPLE_DIR, "corrupted_doc.pdf")
    with open(corrupt_path, "wb") as f:
        f.write(b"NOT_A_REAL_PDF_CORRUPTED_DATA_HEADER_12345")

    print(f"Sample documents and ground-truth text files generated in {SAMPLE_DIR}")

if __name__ == "__main__":
    generate_sample_files()
