# Developer Guide — Structuring Engine Extension Guide

This guide explains how to maintain, extend, and adapt the Structuring Engine for new document types, field types, and retrieval strategies.

---

## 1. Adding a New Synonyms / Field Intent

To register a new field concept (e.g. `vehicle_number` or `driver_license`):

1. Open [`app/request_parser/parser.py`](file:///c:/Users/Asus/Music/the%20projects/structure_engine/app/request_parser/parser.py).
2. Add your field entry to `KNOWN_SYNONYMS`:

```python
    "vehicle_number": {
        "aliases": ["vehicle number", "vehicle no", "registration number", "reg no", "plate number"],
        "type": "string"
    }
```

---

## 2. Adding a New Regex Candidate Pattern

To add a deterministic regex search pattern for a field:

1. Open [`app/candidate_finder/regex_rules.py`](file:///c:/Users/Asus/Music/the%20projects/structure_engine/app/candidate_finder/regex_rules.py).
2. Add your compiled regex to `DETERMINISTIC_PATTERNS`:

```python
DETERMINISTIC_PATTERNS["vehicle_number"] = [
    re.compile(r'\b[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}\b', re.IGNORECASE)
]
```

---

## 3. Adding Custom Disambiguation / Extractor Rules

To handle special line context cleaning or label stripping:

1. Open [`app/field_extractor/extractor.py`](file:///c:/Users/Asus/Music/the%20projects/structure_engine/app/field_extractor/extractor.py).
2. Extend `_clean_candidate_value`:

```python
elif key == "vehicle_number":
    m = re.search(r'\b[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}\b', snippet, re.IGNORECASE)
    if m:
        return m.group(0), 0.98
```

---

## 4. Replacing Candidate Retrieval Strategy

Each component implements an abstract base class interface under `app/<component>/base.py`. To plug in an alternative candidate search strategy (e.g. dense embeddings vector search):

1. Subclass `BaseCandidateFinder` in `app/candidate_finder/base.py`.
2. Implement `find_candidates(self, raw_text: str, parsed_request: ParsedRequest) -> Dict[str, List[Dict[str, Any]]]`.
3. Pass your custom finder instance to `StructuringEngine(candidate_finder=MyVectorFinder())`.

---

## 5. Running Tests & Benchmarks

```bash
# Run complete Pytest test suite
python -m pytest -v tests/

# Run Multi-Document Benchmark evaluation
python -m benchmark.run_benchmark
```
