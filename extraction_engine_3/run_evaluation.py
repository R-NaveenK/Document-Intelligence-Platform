import os
import json
from app.engine import ExtractionEngine
from eval_metrics import calculate_cer, calculate_wer, evaluate_numeric_accuracy

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_documents")

def run_evaluation():
    """
    Evaluates Extraction Engine 1 against Ground Truth (.gt.txt) documents.
    Calculates Character Error Rate (CER), Word Error Rate (WER), and Numeric Accuracy.
    """
    engine = ExtractionEngine()
    gt_files = [f for f in os.listdir(SAMPLE_DIR) if f.endswith(".gt.txt")]

    if not gt_files:
        print("No ground truth (.gt.txt) files found.")
        return

    print("=" * 95)
    print("EXTRACTION ENGINE 1 - QUALITY EVALUATION REPORT (CER / WER / NUMERIC ACCURACY)")
    print("=" * 95)
    print(f"{'Filename':<25} | {'CER':<7} | {'WER':<7} | {'Num Acc':<8} | {'Tot Num':<7} | {'Corr Num':<8}")
    print("-" * 95)

    eval_results = []

    for gt_name in sorted(gt_files):
        doc_base = gt_name[:-7]  # Strip .gt.txt
        # Find matching document
        doc_candidates = [f for f in os.listdir(SAMPLE_DIR) if f.startswith(doc_base) and not f.endswith(".gt.txt")]
        if not doc_candidates:
            continue

        doc_name = doc_candidates[0]
        doc_path = os.path.join(SAMPLE_DIR, doc_name)
        gt_path = os.path.join(SAMPLE_DIR, gt_name)

        with open(gt_path, "r", encoding="utf-8") as f:
            reference_text = f.read().strip()

        res = engine.extract(doc_path, original_filename=doc_name)
        hypothesis_text = res.raw_text.strip()

        cer = calculate_cer(reference_text, hypothesis_text)
        wer = calculate_wer(reference_text, hypothesis_text)
        num_eval = evaluate_numeric_accuracy(reference_text, hypothesis_text)

        eval_record = {
            "filename": doc_name,
            "ground_truth_file": gt_name,
            "cer": cer,
            "wer": wer,
            "numeric_accuracy": num_eval["numeric_accuracy"],
            "total_numeric_tokens": num_eval["total_numeric_tokens"],
            "correct_numeric_tokens": num_eval["correct_numeric_tokens"],
            "missing_numeric_tokens": num_eval["missing_numeric_tokens"],
            "extra_numeric_tokens": num_eval["extra_numeric_tokens"],
            "extraction_confidence": res.extraction_confidence
        }
        eval_results.append(eval_record)

        print(f"{doc_name:<25} | {cer:<7.4f} | {wer:<7.4f} | {num_eval['numeric_accuracy']:<8.4f} | {num_eval['total_numeric_tokens']:<7} | {num_eval['correct_numeric_tokens']:<8}")

    avg_cer = round(sum(r["cer"] for r in eval_results) / len(eval_results), 4) if eval_results else 0.0
    avg_wer = round(sum(r["wer"] for r in eval_results) / len(eval_results), 4) if eval_results else 0.0
    avg_num_acc = round(sum(r["numeric_accuracy"] for r in eval_results) / len(eval_results), 4) if eval_results else 0.0

    print("=" * 95)
    print(f"Overall Metrics across {len(eval_results)} files:")
    print(f"Mean CER: {avg_cer} | Mean WER: {avg_wer} | Mean Numeric Accuracy: {avg_num_acc}")
    print("=" * 95)

    summary_out = {
        "mean_cer": avg_cer,
        "mean_wer": avg_wer,
        "mean_numeric_accuracy": avg_num_acc,
        "evaluations": eval_results
    }

    with open("evaluation_metrics.json", "w", encoding="utf-8") as out_f:
        json.dump(summary_out, out_f, indent=2, ensure_ascii=False)

    return summary_out

if __name__ == "__main__":
    run_evaluation()
