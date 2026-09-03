import sys
import os
import json
from models import ClassifyRequest, PageInputModel, DocumentTypeModel
from service import process_classification

def run_tests():
    print("==================================================")
    print("Running Python FastAPI Classifier Verification Suite")
    print("==================================================\n")

    passed = 0
    failed = 0

    def assert_test(cond, msg):
        nonlocal passed, failed
        if cond:
            print(f"[PASS] {msg}")
            passed += 1
        else:
            print(f"[FAIL] {msg}")
            failed += 1

    # 1. Single-page known document classification
    dt_invoice = DocumentTypeModel(documentTypeId="dt_inv", name="Commercial Invoice", key="invoice", aliases=["Vendor Bill"])
    dt_receipt = DocumentTypeModel(documentTypeId="dt_rec", name="Payment Receipt", key="receipt", aliases=["Fee Slip"])

    req1 = ClassifyRequest(
        jobId="job_001",
        fileId="file_001",
        pages=[PageInputModel(pageNumber=1, text="Commercial Invoice #1001 Total $500", ocrConfidence=0.98)],
        allowedDocumentTypes=[dt_invoice, dt_receipt]
    )
    res1 = process_classification(req1)
    assert_test(len(res1.pageClassifications) == 1, "1. Single-page document classified")
    assert_test(res1.pageClassifications[0].documentTypeId == "dt_inv", "1. Page 1 matched Commercial Invoice")

    # 2. Alias matching & fuzzy matching
    req2 = ClassifyRequest(
        jobId="job_002",
        fileId="file_002",
        pages=[PageInputModel(pageNumber=1, text="Vendor Bill for services rendered", ocrConfidence=0.95)],
        allowedDocumentTypes=[dt_invoice, dt_receipt]
    )
    res2 = process_classification(req2)
    assert_test(res2.pageClassifications[0].documentTypeId == "dt_inv", "2. Alias 'Vendor Bill' matched Commercial Invoice")

    # 3. Empty page handling
    req3 = ClassifyRequest(
        jobId="job_003",
        fileId="file_003",
        pages=[PageInputModel(pageNumber=1, text="", ocrConfidence=0.99)],
        allowedDocumentTypes=[dt_invoice, dt_receipt]
    )
    res3 = process_classification(req3)
    assert_test(res3.pageClassifications[0].classificationMethod == "UNKNOWN", "3. Empty page classified as UNKNOWN")
    assert_test(res3.pageClassifications[0].reviewReason == "INSUFFICIENT_PAGE_CONTENT", "3. Empty page reviewReason is INSUFFICIENT_PAGE_CONTENT")

    # 4. Low OCR confidence penalty
    req4 = ClassifyRequest(
        jobId="job_004",
        fileId="file_004",
        pages=[PageInputModel(pageNumber=1, text="Commercial Invoice #1001", ocrConfidence=0.30)],
        allowedDocumentTypes=[dt_invoice, dt_receipt]
    )
    res4 = process_classification(req4)
    assert_test(res4.pageClassifications[0].confidence < 0.90, "4. Low OCR confidence penalty applied")

    # 5. CRITICAL TEST: Multi-document file grouping (Pages 1-2 Type A, Page 3 Type B, Pages 4-5 Type A)
    dt_a = DocumentTypeModel(documentTypeId="type_a", name="Type A Document", key="type_a", aliases=["Form A"])
    dt_b = DocumentTypeModel(documentTypeId="type_b", name="Type B Document", key="type_b", aliases=["Form B"])

    req5 = ClassifyRequest(
        jobId="job_005",
        fileId="file_005",
        pages=[
            PageInputModel(pageNumber=1, text="Form A Document - Page 1 of 2", ocrConfidence=0.98),
            PageInputModel(pageNumber=2, text="Form A Document continuation - Page 2 of 2", ocrConfidence=0.98),
            PageInputModel(pageNumber=3, text="Form B Document Receipt", ocrConfidence=0.98),
            PageInputModel(pageNumber=4, text="Form A Document - Page 1 of 2", ocrConfidence=0.98),
            PageInputModel(pageNumber=5, text="Form A Document continuation - Page 2 of 2", ocrConfidence=0.98)
        ],
        allowedDocumentTypes=[dt_a, dt_b]
    )
    res5 = process_classification(req5)
    
    assert_test(len(res5.pageGroups) == 3, "5. CRITICAL: 3 distinct logical documents created (Pages 1-2, Page 3, Pages 4-5)")
    assert_test(res5.pageGroups[0].pages == [1, 2] and res5.pageGroups[0].documentTypeId == "type_a", "5. Logical Document 1: Pages [1, 2] Type A")
    assert_test(res5.pageGroups[1].pages == [3] and res5.pageGroups[1].documentTypeId == "type_b", "5. Logical Document 2: Pages [3] Type B")
    assert_test(res5.pageGroups[2].pages == [4, 5] and res5.pageGroups[2].documentTypeId == "type_a", "5. Logical Document 3: Pages [4, 5] Type A (NOT combined with Pages 1-2!)")

    # 6. Dynamic document classification with arbitrary schema document types
    dt_custom1 = DocumentTypeModel(documentTypeId="dt_cust1", name="Custom Logistics Tracking Manifest", key="logistics_manifest")
    dt_custom2 = DocumentTypeModel(documentTypeId="dt_cust2", name="Custom Biological Specimen Sheet", key="specimen_sheet")

    req6 = ClassifyRequest(
        jobId="job_006",
        fileId="file_006",
        pages=[
            PageInputModel(pageNumber=1, text="Custom Logistics Tracking Manifest #99", ocrConfidence=0.99),
            PageInputModel(pageNumber=2, text="Custom Biological Specimen Sheet Sample #42", ocrConfidence=0.99)
        ],
        allowedDocumentTypes=[dt_custom1, dt_custom2]
    )
    res6 = process_classification(req6)
    assert_test(res6.pageClassifications[0].documentTypeId == "dt_cust1", "6. Dynamic custom document type 1 classified without source code changes")
    assert_test(res6.pageClassifications[1].documentTypeId == "dt_cust2", "6. Dynamic custom document type 2 classified without source code changes")

    print("\n==================================================")
    print(f"CLASSIFIER PYTHON SUITE: {passed} Passed, {failed} Failed")
    print("==================================================")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
