import os
import sys
import glob
from pathlib import Path

sys.path.insert(0, os.path.abspath('extraction_engine_3'))
from app.engine import ExtractionEngine

engine = ExtractionEngine()
docs_dir = Path("Docstest")

files = sorted(list(docs_dir.glob("*.*")))

print(f"Total files in Docstest: {len(files)}\n" + "="*70)

for f in files:
    try:
        res = engine.extract(str(f), original_filename=f.name)
        print(f"\nFILE: {f.name} ({res.file_type})")
        print(f"Status: {res.status} | Confidence: {res.extraction_confidence}")
        print("RAW TEXT:")
        print("-" * 40)
        print(res.raw_text.strip() if res.raw_text else "[EMPTY TEXT]")
        print("-" * 40)
    except Exception as e:
        print(f"\nFILE: {f.name} -> ERROR: {e}")
