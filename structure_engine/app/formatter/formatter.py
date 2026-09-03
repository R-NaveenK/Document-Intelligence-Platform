from typing import Dict, Any, List
from pydantic import BaseModel
from app.models.structuring_output import StructuringResponse, StructuringSummary, FieldExtractionResult
from app.formatter.base import BaseOutputFormatter
from app.core.logging_config import logger

class OutputFormatter(BaseOutputFormatter):
    """Output Formatter assembling final standardized response payload."""

    def format_response(
        self,
        document_id: str,
        structured_data_model: BaseModel,
        field_extraction_results: Dict[str, FieldExtractionResult],
        processing_time_ms: float,
        warnings: List[str] = None
    ) -> StructuringResponse:
        warnings_list = warnings or []
        structured_data = structured_data_model.model_dump()

        field_status: Dict[str, str] = {}
        found_cnt = 0
        not_found_cnt = 0
        ambiguous_cnt = 0

        for key, res in field_extraction_results.items():
            st = res.status
            field_status[key] = st
            if st == "found":
                found_cnt += 1
            elif st == "ambiguous":
                ambiguous_cnt += 1
            else:
                not_found_cnt += 1

        total_req = len(field_extraction_results)
        
        if found_cnt == total_req:
            overall_status = "success"
        elif found_cnt > 0:
            overall_status = "partial_success"
        else:
            overall_status = "partial_success" if total_req > 0 else "error"

        summary = StructuringSummary(
            total_requested=total_req,
            found_count=found_cnt,
            not_found_count=not_found_cnt,
            ambiguous_count=ambiguous_cnt
        )

        response = StructuringResponse(
            status=overall_status,
            document_id=document_id or "DOC_UNKNOWN",
            structured_data=structured_data,
            field_status=field_status,
            field_details=field_extraction_results,
            summary=summary,
            processing_time_ms=round(processing_time_ms, 2),
            warnings=warnings_list,
            errors=[]
        )

        logger.info(
            f"Output Formatter created payload for doc '{document_id}': status='{overall_status}', "
            f"found={found_cnt}/{total_req}, elapsed={round(processing_time_ms, 2)}ms"
        )
        return response
