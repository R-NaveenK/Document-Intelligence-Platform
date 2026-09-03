"""Detailed failure analysis for evaluation results."""
import json
from pathlib import Path

gt = json.loads(Path("tests/ground_truth.json").read_text(encoding="utf-8"))

files_to_inspect = {
    "scanned_invoice.pdf": "tests\\test_documents\\pdf\\scanned_invoice.pdf",
    "clean.jpg": "tests\\test_documents\\images\\clean.jpg",
    "noisy.png": "tests\\test_documents\\images\\noisy.png",
    "rotated_90.jpg": "tests\\test_documents\\images\\rotated_90.jpg",
    "rotated_180.jpg": "tests\\test_documents\\images\\rotated_180.jpg",
    "rotated_270.jpg": "tests\\test_documents\\images\\rotated_270.jpg",
    "low_resolution.png": "tests\\test_documents\\images\\low_resolution.png",
}

for name, gt_key in files_to_inspect.items():
    doc_gt = gt[gt_key]
    artifact = Path(f"data/cor_extractions/eval_{Path(name).stem}.txt")
    if not artifact.exists():
        print(f"=== {name}: ARTIFACT MISSING ===")
        continue
    text = artifact.read_text(encoding="utf-8")
    
    print(f"\n{'='*60}")
    print(f"=== {name} ===")
    print(f"{'='*60}")
    
    # Text recall
    for item in doc_gt.get("required_text", []):
        if item in text:
            status = "PASS"
        elif item.lower() in text.lower():
            status = "PASS (case)"
        else:
            status = "MISS"
        print(f"  TEXT [{status:>12}] {item!r}")
    
    # Number recall
    for item in doc_gt.get("required_numbers", []):
        if item in text:
            status = "PASS"
        else:
            status = "MISS"
        print(f"  NUM  [{status:>12}] {item!r}")
    
    print(f"  --- Full extracted text ({len(text)} chars) ---")
    for line in text.split("\n")[:20]:
        print(f"    | {line.rstrip()}")
    if text.count("\n") > 20:
        print(f"    ... ({text.count(chr(10))} total lines)")
