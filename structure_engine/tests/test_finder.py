from app.request_parser.parser import RequestParser
from app.candidate_finder.finder import CandidateFinder

def test_candidate_finder_category3_seller_vs_customer(sample_invoice_input):
    parser = RequestParser()
    finder = CandidateFinder()
    
    parsed = parser.parse("Give me seller name and customer name.")
    candidates = finder.find_candidates(sample_invoice_input.raw_text, parsed)
    
    assert "seller_name" in candidates
    assert "customer_name" in candidates
    assert len(candidates["seller_name"]) > 0
    assert len(candidates["customer_name"]) > 0

def test_candidate_finder_category11_noisy_ocr():
    parser = RequestParser()
    finder = CandidateFinder()
    
    noisy_text = (
        "TAX lNVOlCE\n"
        "TECHSOLUTlONS PVT LTD\n"
        "lnvoice No TSPL/INV/2026-27/0897\n"
        "lnvoice Date 02-09-2026\n"
        "BlLL TO\n"
        "ABC lNDUSTRlES LTD\n"
        "Total lnvoice Amount 489075.00"
    )
    
    parsed = parser.parse("Extract invoice number, invoice date, customer name and total amount.")
    candidates = finder.find_candidates(noisy_text, parsed)
    
    assert len(candidates["invoice_number"]) > 0
    assert len(candidates["invoice_date"]) > 0
    assert len(candidates["customer_name"]) > 0
    assert len(candidates["total_amount"]) > 0
