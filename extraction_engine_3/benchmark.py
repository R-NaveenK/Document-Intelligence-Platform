import os
import sys
import json
import argparse
import time
from pathlib import Path
from typing import List, Dict, Any

from app.engine import ExtractionEngine
from app.models.extraction_result import ExtractionStatus


def run_benchmark(input_dir: str, output_json: str = "benchmark_results.json") -> Dict[str, Any]:
    """
    Executes benchmark evaluation over a directory of target documents.
    Generates structured metrics JSON file suitable for downstream Comparison Engine evaluation.
    """
    if not os.path.exists(input_dir):
        print(f"Error: Input directory '{input_dir}' does not exist.")
        sys.exit(1)

    engine = ExtractionEngine()
    supported_exts = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}

    files = [
        f for f in os.listdir(input_dir)
        if os.path.isfile(os.path.join(input_dir, f)) and Path(f).suffix.lower() in supported_exts
    ]

    if not files:
        print(f"No supported document files found in '{input_dir}'.")
        return {}

    print("=" * 85)
    print(f"EXTRACTION ENGINE 1 BENCHMARK - Target Directory: {input_dir}")
    print(f"Engine ID: {engine.get_engine_id()} | Version: {engine.get_version()}")
    print("=" * 85)

    results: List[Dict[str, Any]] = []
    total_docs = len(files)
    total_time_ms = 0
    successful_extractions = 0

    print(f"{'Filename':<30} | {'Status':<12} | {'Time (ms)':<10} | {'Chars':<7} | {'Conf':<6}")
    print("-" * 85)

    for filename in sorted(files):
        file_path = os.path.join(input_dir, filename)
        start_t = time.time()
        
        try:
            res = engine.extract(file_path, original_filename=filename)
            duration_ms = res.processing_time_ms
            char_count = len(res.raw_text)
            conf = res.extraction_confidence
            status_str = res.status.value

            if res.status in [ExtractionStatus.SUCCESS, ExtractionStatus.PARTIAL_SUCCESS]:
                successful_extractions += 1

            record = {
                "engine_id": res.engine_id,
                "filename": filename,
                "status": status_str,
                "processing_time_ms": duration_ms,
                "character_count": char_count,
                "pages_processed": res.pages_processed,
                "extraction_confidence": conf,
                "raw_text": res.raw_text,
                "warnings": res.warnings,
                "errors": res.errors
            }
            results.append(record)
            total_time_ms += duration_ms

            text_preview = res.raw_text.replace("\n", " ")[:30]
            print(f"{filename:<30} | {status_str:<12} | {duration_ms:<10} | {char_count:<7} | {conf:<6.2f}")

        except Exception as e:
            print(f"{filename:<30} | {'FAILED':<12} | {'N/A':<10} | {'0':<7} | {'0.00':<6}")
            results.append({
                "engine_id": engine.get_engine_id(),
                "filename": filename,
                "status": "error",
                "processing_time_ms": int((time.time() - start_t) * 1000),
                "character_count": 0,
                "pages_processed": 0,
                "extraction_confidence": 0.0,
                "raw_text": "",
                "errors": [str(e)]
            })

    avg_time = round(total_time_ms / total_docs, 2) if total_docs > 0 else 0

    benchmark_summary = {
        "engine_id": engine.get_engine_id(),
        "engine_version": engine.get_version(),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_documents": total_docs,
        "successful_documents": successful_extractions,
        "total_time_ms": total_time_ms,
        "average_time_ms_per_doc": avg_time,
        "results": results
    }

    with open(output_json, "w", encoding="utf-8") as out_f:
        json.dump(benchmark_summary, out_f, indent=2, ensure_ascii=False)

    print("=" * 85)
    print(f"Summary: Processed {total_docs} files | Successful: {successful_extractions} | Avg Time: {avg_time} ms/doc")
    print(f"Detailed benchmark results saved to '{output_json}'.")
    print("=" * 85)

    return benchmark_summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Extraction Engine 1 Benchmark")
    parser.add_argument("--sample-dir", default="sample_documents", help="Directory containing sample documents")
    parser.add_argument("--output", default="benchmark_results.json", help="Output JSON path")
    args = parser.parse_args()

    run_benchmark(args.sample_dir, args.output)
