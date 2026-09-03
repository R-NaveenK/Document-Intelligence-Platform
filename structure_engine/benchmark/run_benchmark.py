"""
Benchmark Evaluation Runner for Structuring Engine
Executes complete pipeline evaluations across benchmark datasets, measuring latency, resource usage, field accuracy, recall, precision, missing-field detection, and schema compliance.
"""

import time
import psutil
import os
from typing import Dict, Any, List
from app.engine import StructuringEngine
from benchmark.dataset import BENCHMARK_DATASET

def run_benchmark_evaluation() -> Dict[str, Any]:
    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss / (1024 * 1024)
    
    start_cold = time.perf_counter()
    engine = StructuringEngine()
    cold_start_ms = (time.perf_counter() - start_cold) * 1000.0

    total_requests = 0
    total_fields_expected = 0
    correct_fields = 0
    missing_fields_expected = 0
    missing_fields_detected = 0
    hallucinated_fields = 0
    ambiguous_fields = 0
    schema_compliant_count = 0
    complete_request_success_count = 0
    
    total_warm_time_ms = 0.0
    doc_type_matrix: Dict[str, Dict[str, int]] = {}
    
    for doc in BENCHMARK_DATASET:
        doc_id = doc["id"]
        doc_cat = doc["category"]
        doc_name = doc["name"]
        raw_text = doc["raw_text"]
        
        if doc_cat not in doc_type_matrix:
            doc_type_matrix[doc_cat] = {"tested": 0, "correct": 0, "incorrect": 0, "missing_detected": 0}
        
        for req_item in doc["requests"]:
            query = req_item["query"]
            expected = req_item.get("expected", {})
            expected_list = req_item.get("expected_list")
            expected_count = req_item.get("expected_count", 0)
            
            t0 = time.perf_counter()
            response = engine.structure(raw_extraction=raw_text, user_request=query)
            t_elapsed_ms = (time.perf_counter() - t0) * 1000.0
            
            total_warm_time_ms += t_elapsed_ms
            total_requests += 1
            
            if response.structured_data is not None and isinstance(response.field_status, dict):
                schema_compliant_count += 1
                
            req_success = True
            
            if expected_list:
                total_fields_expected += 1
                doc_type_matrix[doc_cat]["tested"] += 1
                list_data = response.structured_data.get(expected_list, [])
                if isinstance(list_data, list) and len(list_data) >= expected_count:
                    correct_fields += 1
                    doc_type_matrix[doc_cat]["correct"] += 1
                else:
                    req_success = False
                    doc_type_matrix[doc_cat]["incorrect"] += 1
            else:
                for f_key, exp_val in expected.items():
                    total_fields_expected += 1
                    doc_type_matrix[doc_cat]["tested"] += 1
                    actual_val = response.structured_data.get(f_key)
                    
                    if exp_val is None:
                        missing_fields_expected += 1
                        if actual_val is None and response.field_status.get(f_key) == "not_found":
                            missing_fields_detected += 1
                            correct_fields += 1
                            doc_type_matrix[doc_cat]["missing_detected"] += 1
                        else:
                            hallucinated_fields += 1
                            req_success = False
                            doc_type_matrix[doc_cat]["incorrect"] += 1
                    else:
                        if actual_val is not None and (str(exp_val).lower() in str(actual_val).lower() or str(actual_val).lower() in str(exp_val).lower()):
                            correct_fields += 1
                            doc_type_matrix[doc_cat]["correct"] += 1
                        else:
                            if response.field_status.get(f_key) == "ambiguous":
                                ambiguous_fields += 1
                            req_success = False
                            doc_type_matrix[doc_cat]["incorrect"] += 1
                                
            if req_success:
                complete_request_success_count += 1

    mem_after = process.memory_info().rss / (1024 * 1024)
    avg_warm_latency_ms = total_warm_time_ms / max(1, total_requests)
    field_accuracy = (correct_fields / max(1, total_fields_expected)) * 100.0
    missing_field_acc = (missing_fields_detected / max(1, missing_fields_expected)) * 100.0 if missing_fields_expected > 0 else 100.0
    hallucination_rate = (hallucinated_fields / max(1, total_fields_expected)) * 100.0
    schema_compliance_rate = (schema_compliant_count / max(1, total_requests)) * 100.0
    e2e_success_rate = (complete_request_success_count / max(1, total_requests)) * 100.0
    
    return {
        "cold_start_ms": round(cold_start_ms, 2),
        "avg_warm_latency_ms": round(avg_warm_latency_ms, 2),
        "ram_mb": round(mem_after, 2),
        "ram_diff_mb": round(mem_after - mem_before, 2),
        "total_requests": total_requests,
        "total_fields": total_fields_expected,
        "correct_fields": correct_fields,
        "field_accuracy_pct": round(field_accuracy, 2),
        "missing_field_acc_pct": round(missing_field_acc, 2),
        "hallucination_rate_pct": round(hallucination_rate, 2),
        "schema_compliance_pct": round(schema_compliance_rate, 2),
        "e2e_success_rate_pct": round(e2e_success_rate, 2),
        "doc_type_matrix": doc_type_matrix
    }

if __name__ == "__main__":
    metrics = run_benchmark_evaluation()
    print("=" * 55)
    print("        STRUCTURING ENGINE BENCHMARK RESULTS         ")
    print("=" * 55)
    print(f"  • Cold Start Latency     : {metrics['cold_start_ms']} ms")
    print(f"  • Warm Latency (Avg)     : {metrics['avg_warm_latency_ms']} ms")
    print(f"  • RAM Footprint          : {metrics['ram_mb']} MB (Delta: {metrics['ram_diff_mb']} MB)")
    print(f"  • Total Test Requests    : {metrics['total_requests']}")
    print(f"  • Total Fields Evaluated  : {metrics['total_fields']}")
    print(f"  • Field Accuracy         : {metrics['field_accuracy_pct']}%")
    print(f"  • Missing-Field Accuracy : {metrics['missing_field_acc_pct']}%")
    print(f"  • Hallucination Rate     : {metrics['hallucination_rate_pct']}%")
    print(f"  • Schema Compliance      : {metrics['schema_compliance_pct']}%")
    print(f"  • End-to-End Success Rate: {metrics['e2e_success_rate_pct']}%")
    print("=" * 55)
