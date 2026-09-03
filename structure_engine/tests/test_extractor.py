from app.request_parser.parser import RequestParser
from app.candidate_finder.finder import CandidateFinder
from app.field_extractor.extractor import FieldExtractor

def test_field_extractor_category4_and_5_numerical_and_contextual(sample_invoice_input):
    parser = RequestParser()
    finder = CandidateFinder()
    extractor = FieldExtractor()
    
    parsed = parser.parse("I need invoice number, invoice date, customer name, customer GSTIN, total amount, bank account and IFSC.")
    candidates = finder.find_candidates(sample_invoice_input.raw_text, parsed)
    results = extractor.extract_fields(sample_invoice_input.raw_text, candidates, parsed)
    
    assert results["invoice_number"].status == "found"
    assert results["invoice_number"].value == "TSPL/INV/2026-27/0897"
    
    assert results["customer_name"].status == "found"
    assert results["customer_name"].value.startswith("ABC INDUSTRIES LTD")
    
    assert results["customer_gstin"].status == "found"
    assert results["customer_gstin"].value == "27AABCU9638R1Z2"
    
    assert results["total_amount"].status == "found"
    assert "4,89,075.00" in results["total_amount"].value

def test_field_extractor_category10_source_value_preservation():
    parser = RequestParser()
    finder = CandidateFinder()
    extractor = FieldExtractor()
    
    raw_ocr = "Tax Invoice\nInvoice No: INV-0O123\nDate: 01-01-2026"
    parsed = parser.parse("Extract invoice number")
    candidates = finder.find_candidates(raw_ocr, parsed)
    results = extractor.extract_fields(raw_ocr, candidates, parsed)
    
    assert results["invoice_number"].value == "INV-0O123"

def test_field_extractor_category7_ambiguous_field():
    parser = RequestParser()
    finder = CandidateFinder()
    extractor = FieldExtractor()
    
    ambiguous_text = "Company Name: TECHSOLUTIONS PVT LTD or ABC INDUSTRIES LTD"
    parsed = parser.parse("Extract company name")
    candidates = finder.find_candidates(ambiguous_text, parsed)
    results = extractor.extract_fields(ambiguous_text, candidates, parsed)
    
    assert "seller_name" in results
