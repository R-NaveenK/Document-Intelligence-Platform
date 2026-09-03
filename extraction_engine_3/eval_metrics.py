import os
import re
import json
from typing import Dict, Any, List, Tuple

def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculates Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]

def calculate_cer(reference: str, hypothesis: str) -> float:
    """Calculates Character Error Rate (CER)."""
    ref_chars = reference.replace("\r", "")
    hyp_chars = hypothesis.replace("\r", "")
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0
    dist = levenshtein_distance(ref_chars, hyp_chars)
    return round(dist / len(ref_chars), 4)

def calculate_wer(reference: str, hypothesis: str) -> float:
    """Calculates Word Error Rate (WER)."""
    ref_words = reference.split()
    hyp_words = hypothesis.split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
    dist = levenshtein_distance(ref_words, hyp_words)
    return round(dist / len(ref_words), 4)

def evaluate_numeric_accuracy(reference: str, hypothesis: str) -> Dict[str, Any]:
    """
    Evaluates numeric token accuracy specifically.
    Extracts all tokens containing numbers or currency symbols ($1,250.50, ₹82,500, 12.5%, etc.)
    """
    numeric_pattern = re.compile(r'[\$₹€£]?\d+(?:[.,]\d+)*%?')
    
    ref_tokens = numeric_pattern.findall(reference)
    hyp_tokens = numeric_pattern.findall(hypothesis)

    total_ref = len(ref_tokens)
    correct = 0
    missing = []
    incorrect = []

    hyp_tokens_copy = list(hyp_tokens)

    for token in ref_tokens:
        if token in hyp_tokens_copy:
            correct += 1
            hyp_tokens_copy.remove(token)
        else:
            missing.append(token)

    extra = hyp_tokens_copy
    accuracy = round(correct / total_ref, 4) if total_ref > 0 else 1.0

    return {
        "total_numeric_tokens": total_ref,
        "correct_numeric_tokens": correct,
        "missing_numeric_tokens": missing,
        "extra_numeric_tokens": extra,
        "numeric_accuracy": accuracy
    }
