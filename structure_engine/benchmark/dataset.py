"""
Benchmark Dataset containing Ground Truth expected structured outputs across 6 document categories.
Categories:
1. Invoice (Clean & Noisy)
2. Receipt
3. Certificate
4. Purchase Order
5. General Business Document (Form)
6. Semi-structured Diagnostic Report
"""

from typing import Dict, Any, List

BENCHMARK_DATASET: List[Dict[str, Any]] = [
    {
        "id": "DOC-INV-001",
        "category": "Invoice",
        "name": "TechSolutions Tax Invoice (Clean)",
        "raw_text": """TAX INVOICE

TECHSOLUTIONS PVT LTD
123 4th Floor Prestige Tech Park
Marathahalli Outer Ring Road
Bengaluru 560103 Karnataka India
Phone +91 80 4123 4567
Email info@techsolutions.com
GSTIN 29AABCT1234Q1Z5
CIN U72200KA2018PTC123456

Invoice No TSPL/INV/2026-27/0897
Invoice Date 02-09-2026
Due Date 17-09-2026
PO Number PO/2026-27/0456
Place of Supply Karnataka 29
Reverse Charge No

BILL TO
ABC INDUSTRIES LTD
45 Industrial Area Whitefield
Bengaluru 560066 Karnataka India
GSTIN 29AAACB1234C1Z6
State Karnataka 29

SHIP TO
ABC INDUSTRIES LTD
Warehouse No 7 KIADB Industrial Area
Hoskote Bengaluru 562114 Karnataka India
State Karnataka 29

ITEMS

1 Dell Latitude 5440 Laptop 84713010 5 Nos 58500.00 292500.00

2 Logitech MX Master 3S Mouse 84716060 10 Nos 9450.00 94500.00

3 Samsung 24-inch FHD Monitor 85285200 5 Nos 13500.00 67500.00

4 Zebronics Keyboard and Mouse Combo 84716040 10 Nos 1250.00 12500.00

5 HP 65W Type-C Laptop Charger 85044090 5 Nos 2650.00 13250.00

Subtotal 480250.00
CGST 9 percent 43222.50
SGST 9 percent 43222.50
IGST 18 percent -

Total Invoice Amount 489075.00

Amount in Words Four Lakh Eighty Nine Thousand Seventy Five Rupees Only

BANK DETAILS

HDFC Bank Ltd
Account Name TechSolutions Pvt Ltd
Account Number 50200012345678
IFSC HDFC0001234
Branch Marathahalli Bengaluru
""",
        "requests": [
            {
                "query": "Extract invoice number, invoice date, customer name, customer GSTIN, PO number and total amount",
                "expected": {
                    "invoice_number": "TSPL/INV/2026-27/0897",
                    "invoice_date": "02-09-2026",
                    "customer_name": "ABC INDUSTRIES LTD",
                    "customer_gstin": "29AAACB1234C1Z6",
                    "po_number": "PO/2026-27/0456",
                    "total_amount": "489075.00"
                }
            },
            {
                "query": "Give me all products with name, HSN code, quantity, unit price and amount",
                "expected_list": "products",
                "expected_count": 5
            },
            {
                "query": "Give me invoice number, PAN number and email",
                "expected": {
                    "invoice_number": "TSPL/INV/2026-27/0897",
                    "pan_number": None,
                    "email": "info@techsolutions.com"
                }
            }
        ]
    },
    {
        "id": "DOC-RCP-002",
        "category": "Receipt",
        "name": "XYZ Mart Store Receipt (Clean & Compact)",
        "raw_text": """STORE RECEIPT
Merchant: XYZ MART PVT LTD
Date: 01-09-2026
Receipt No: RCP-4582
GSTIN: 27XYZMP9988K1Z3

ITEMS PURCHASED:
1 Organic Whole Milk 1L - Qty 2 @ 65.00 = 130.00
2 Whole Wheat Bread 400g - Qty 1 @ 45.00 = 45.00
3 Filter Coffee Powder 250g - Qty 2 @ 180.00 = 360.00

Subtotal: 535.00
Taxes (CGST 2.5%, SGST 2.5%): 26.75
Total Amount Payable: 561.75
Payment Mode: UPI Ref: 9876543210
""",
        "requests": [
            {
                "query": "Give me merchant, receipt number, date and total amount",
                "expected": {
                    "seller_name": "XYZ MART PVT LTD",
                    "invoice_number": "RCP-4582",
                    "invoice_date": "01-09-2026",
                    "total_amount": "561.75"
                }
            }
        ]
    },
    {
        "id": "DOC-CRT-003",
        "category": "Certificate",
        "name": "Course Completion Certificate",
        "raw_text": """CERTIFICATE OF COMPLETION
This is to certify that
Candidate Name: Rahul Kumar
Certificate No: CERT-2026-045
Issue Date: 15-08-2026
Course: Advanced Python Programming & AI Systems
Issued By: Tech Learning Academy India
""",
        "requests": [
            {
                "query": "Give me candidate name, certificate number and issue date",
                "expected": {
                    "customer_name": "Rahul Kumar",
                    "certificate_number": "CERT-2026-045",
                    "invoice_date": "15-08-2026"
                }
            }
        ]
    },
    {
        "id": "DOC-PO-004",
        "category": "Purchase Order",
        "name": "Global Logistics Purchase Order",
        "raw_text": """PURCHASE ORDER
Vendor: Apex Industrial Supplies Ltd
PO Number: PO-GL-2026-9921
PO Date: 28-08-2026
Delivery Date: 10-09-2026

SHIP TO:
Global Logistics Solutions Hub
Plot 12 Port Area Navi Mumbai
GSTIN: 27GLSHB5544R1Z9

LINE ITEMS:
1 Heavy Duty Pallet Racks - 10 Nos @ 12500.00 = 125000.00
2 Hydraulic Hand Pallet Truck - 2 Nos @ 18500.00 = 37000.00

Total PO Value: 162000.00
""",
        "requests": [
            {
                "query": "Extract vendor name, purchase order number, PO date and total amount",
                "expected": {
                    "seller_name": "Apex Industrial Supplies Ltd",
                    "po_number": "PO-GL-2026-9921",
                    "invoice_date": "28-08-2026",
                    "total_amount": "162000.00"
                }
            }
        ]
    },
    {
        "id": "DOC-NOISY-005",
        "category": "Noisy OCR Invoice",
        "name": "Noisy OCR Invoice with Typos",
        "raw_text": """TAX lNVOlCE

TECHSOLUTlONS PVT LTD
123 4th Floor Prestige Tech Park
Bengaluru 560103
lnvoice No TSPL/INV/2026-27/0897
lnvoice Date 02-09-2026

BlLL TO
ABC lNDUSTRlES LTD
GSTIN 29AAACB1234C1Z6

Total lnvoice Amount 489075.00
""",
        "requests": [
            {
                "query": "Extract invoice number, invoice date, customer name and total amount",
                "expected": {
                    "invoice_number": "TSPL/INV/2026-27/0897",
                    "invoice_date": "02-09-2026",
                    "customer_name": "ABC lNDUSTRlES LTD",
                    "total_amount": "489075.00"
                }
            }
        ]
    },
    {
        "id": "DOC-MED-006",
        "category": "Semi-Structured Form",
        "name": "Diagnostic Pathology Lab Report",
        "raw_text": """METROPOLIS DIAGNOSTICS LAB
Patient Name: Suresh Verma
Age / Sex: 45 Y / Male
Lab ID: LAB-2026-88192
Test Date: 30-08-2026

TEST RESULT:
Serum Cholesterol: 215.50 mg/dL (Normal Range: 120 - 200)
Fast Blood Sugar: 110.00 mg/dL

Referred By: Dr. A. K. Sharma
""",
        "requests": [
            {
                "query": "Extract patient name, lab ID, test date and cholesterol level",
                "expected": {
                    "customer_name": "Suresh Verma",
                    "invoice_number": "LAB-2026-88192",
                    "invoice_date": "30-08-2026",
                    "total_amount": "215.50"
                }
            }
        ]
    }
]
