from typing import Any, Dict, List, Optional
from rapidfuzz import fuzz

from app.config.loader import get_risk_rules, get_validation_rules
from app.models.document import BaseDocument
from app.models.validation_result import (
    Severity,
    ValidationResultItem,
    ValidationStatus,
)
from app.validation.base import BaseValidator


class DuplicateValidator(BaseValidator):
    @property
    def name(self) -> str:
        return "duplicate"

    def validate(self, document: BaseDocument, context: Optional[Dict[str, Any]] = None) -> ValidationResultItem:
        val_rules = get_validation_rules()
        dup_rules = val_rules.get("duplicate", {})
        thresholds = dup_rules.get("similarity_thresholds", {"warning_min": 0.80, "high_min": 0.95, "critical_min": 1.0})
        comparison_fields: List[str] = dup_rules.get(
            "comparison_fields", ["invoice_number", "vendor_name", "total_amount", "po_number"]
        )

        risk_rules = get_risk_rules().get("risk_points", {}).get("duplicate", {})

        repo = (context or {}).get("repository")
        if not repo:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.PASS,
                severity=Severity.LOW,
                risk_points=0,
                message="Duplicate validation skipped (No document repository context)",
                details={},
            )

        current_hash = document.calculate_sha256()
        current_raw = document.raw_data or {}
        org_id = current_raw.get("organizationId") or current_raw.get("organization_id") or current_raw.get("tenantId")

        # LEVEL 1: Exact Hash Match (Tenant-isolated)
        exact_match = repo.find_by_hash(current_hash)
        if exact_match and exact_match.document_id != document.document_id:
            matched_raw = exact_match.raw_data or {}
            matched_org = matched_raw.get("organizationId") or matched_raw.get("organization_id") or matched_raw.get("tenantId")
            if not org_id or not matched_org or org_id == matched_org:
                return ValidationResultItem(
                    validator=self.name,
                    status=ValidationStatus.FAIL,
                    severity=Severity.CRITICAL,
                    risk_points=risk_rules.get("critical", 35),
                    message=f"Exact duplicate document detected (Matches '{exact_match.document_id}')",
                    details={
                        "duplicate_type": "EXACT",
                        "matched_document_id": exact_match.document_id,
                        "similarity": 1.0,
                    },
                )

        # LEVEL 2: Near-Duplicate Field Similarity Match (Tenant-isolated)
        all_docs = repo.get_all_documents(exclude_id=document.document_id)

        if org_id:
            all_docs = [
                d for d in all_docs
                if (d.raw_data or {}).get("organizationId") == org_id
                or (d.raw_data or {}).get("organization_id") == org_id
                or (d.raw_data or {}).get("tenantId") == org_id
            ]

        target_sig_parts = [str(current_raw.get(f, "")) for f in comparison_fields if current_raw.get(f)]
        id_fields = ["invoice_number", "po_number", "vendor_name", "reference_number", "student_name", "document_number"]
        has_identifier = any(current_raw.get(f) for f in id_fields)

        # Do not compute similarity on single scalar numbers without identifiers
        if not has_identifier and len(target_sig_parts) < 2:
            target_sig = ""
        else:
            target_sig = " | ".join(target_sig_parts)

        best_score = 0.0
        best_match_id = None

        if target_sig and all_docs:
            for other_doc in all_docs:
                other_raw = other_doc.raw_data or {}
                other_sig_parts = [str(other_raw.get(f, "")) for f in comparison_fields if other_raw.get(f)]
                other_has_id = any(other_raw.get(f) for f in id_fields)
                if not other_has_id and len(other_sig_parts) < 2:
                    continue
                other_sig = " | ".join(other_sig_parts)

                if not other_sig:
                    continue

                similarity = fuzz.token_sort_ratio(target_sig, other_sig) / 100.0
                if similarity > best_score:
                    best_score = similarity
                    best_match_id = other_doc.document_id

        details = {
            "highest_similarity": round(best_score, 4),
            "matched_document_id": best_match_id,
        }

        warning_min = float(thresholds.get("warning_min", 0.80))
        high_min = float(thresholds.get("high_min", 0.95))

        if best_score >= high_min and best_match_id:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.FAIL,
                severity=Severity.HIGH,
                risk_points=risk_rules.get("high", 25),
                message=f"Probable duplicate document detected ({best_score*100:.1f}% similarity with '{best_match_id}')",
                details=details,
            )
        elif best_score >= warning_min and best_match_id:
            return ValidationResultItem(
                validator=self.name,
                status=ValidationStatus.WARNING,
                severity=Severity.MEDIUM,
                risk_points=risk_rules.get("warning", 15),
                message=f"Possible duplicate document detected ({best_score*100:.1f}% similarity with '{best_match_id}')",
                details=details,
            )

        return ValidationResultItem(
            validator=self.name,
            status=ValidationStatus.PASS,
            severity=Severity.LOW,
            risk_points=risk_rules.get("pass", 0),
            message="No duplicate document detected",
            details=details,
        )
