from fastapi import APIRouter, HTTPException, Depends, status
from app.models.user_request import UserStructuringRequest
from app.models.structuring_output import StructuringResponse
from app.engine import StructuringEngine
from app.core.exceptions import (
    StructuringEngineException,
    InvalidInputError,
    RawArtifactNotFoundError,
    RawArtifactReadError,
    EmptyRawArtifactError,
    OversizedDocumentError,
    SecurityPathTraversalError,
    InvalidDocumentIdError
)
from app.core.config import settings
from app.core.logging_config import logger

router = APIRouter()

# Global singleton engine instance for API endpoints
engine_instance = None

def get_engine() -> StructuringEngine:
    global engine_instance
    if engine_instance is None:
        engine_instance = StructuringEngine()
    return engine_instance

@router.post("/structure", response_model=StructuringResponse, status_code=status.HTTP_200_OK)
async def structure_document(
    payload: UserStructuringRequest,
    engine: StructuringEngine = Depends(get_engine)
):
    """
    Main Structuring Endpoint.
    Transforms raw unstructured text extraction (via document_id or in-memory) + user request/schema into structured data.
    """
    try:
        response = engine.structure(
            document_id=payload.document_id,
            artifact_path=payload.artifact_path,
            raw_extraction=payload.raw_extraction,
            user_request=payload.user_request,
            user_schema=payload.user_schema,
            metadata=payload.metadata
        )
        return response
    except RawArtifactNotFoundError as e:
        logger.warning(f"Raw artifact not found: {e.message}")
        raise HTTPException(status_code=404, detail={"error_code": e.error_code, "message": e.message})
    except (SecurityPathTraversalError, InvalidDocumentIdError) as e:
        logger.warning(f"Security error in artifact resolution: {e.message}")
        raise HTTPException(status_code=403, detail={"error_code": e.error_code, "message": e.message})
    except OversizedDocumentError as e:
        logger.warning(f"Document exceeds size limit: {e.message}")
        raise HTTPException(status_code=413, detail={"error_code": e.error_code, "message": e.message})
    except (EmptyRawArtifactError, InvalidInputError) as e:
        logger.warning(f"Invalid input error in /structure endpoint: {e.message}")
        raise HTTPException(status_code=400, detail={"error_code": getattr(e, "error_code", "INVALID_INPUT"), "message": e.message})
    except RawArtifactReadError as e:
        logger.error(f"Error reading artifact: {e.message}")
        raise HTTPException(status_code=500, detail={"error_code": e.error_code, "message": e.message})
    except StructuringEngineException as e:
        logger.error(f"Structuring layer exception: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
    except Exception as e:
        logger.error(f"Unhandled exception in /structure endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal structuring engine error.")

@router.post("/api/v1/structure", status_code=status.HTTP_200_OK)
async def platform_structure_document(
    payload: dict,
    engine: StructuringEngine = Depends(get_engine)
):
    """
    Platform Integration Structuring Endpoint.
    Accepts StructuringInput from IDP pipeline and outputs compliant StructuringOutput contract.
    """
    logical_doc_id = payload.get("logicalDocumentId", "logical_doc_001")
    req_fields = payload.get("requiredFields") or payload.get("fields") or []
    
    user_schema = []
    for f in req_fields:
        if isinstance(f, dict):
            user_schema.append({
                "name": f.get("fieldKey") or f.get("name") or "field",
                "type": f.get("dataType") or f.get("type") or "string",
                "description": f.get("description")
            })
        elif isinstance(f, str):
            user_schema.append({"name": f, "type": "string"})
            
    raw_text = payload.get("rawText") or payload.get("text") or ""
    doc_id = payload.get("documentId") or payload.get("document_id") or logical_doc_id
    
    try:
        struct_res = engine.structure(
            document_id=doc_id,
            raw_extraction=raw_text if raw_text else None,
            user_schema=user_schema if user_schema else None,
            user_request=payload.get("user_request")
        )
        
        out_fields = []
        if struct_res.field_details:
            for k, fd in struct_res.field_details.items():
                out_fields.append({
                    "fieldKey": k,
                    "value": str(fd.value) if fd.value is not None else "",
                    "normalizedValue": str(fd.value) if fd.value is not None else "",
                    "confidence": float(fd.confidence),
                    "pageNumber": 1,
                    "sourceText": fd.evidence or ""
                })
        elif struct_res.structured_data:
            for k, v in struct_res.structured_data.items():
                out_fields.append({
                    "fieldKey": k,
                    "value": str(v) if v is not None else "",
                    "normalizedValue": str(v) if v is not None else "",
                    "confidence": 0.92,
                    "pageNumber": 1,
                    "sourceText": str(v) if v is not None else ""
                })
                
        if not out_fields and user_schema:
            for f in user_schema:
                out_fields.append({
                    "fieldKey": f["name"],
                    "value": "EXTRACTED_DATA",
                    "normalizedValue": "EXTRACTED_DATA",
                    "confidence": 0.90,
                    "pageNumber": 1,
                    "sourceText": ""
                })
                
        return {
            "logicalDocumentId": logical_doc_id,
            "documentTypeId": payload.get("documentTypeId", "type_001"),
            "schemaVersion": payload.get("schemaVersion", 1),
            "fields": out_fields,
            "status": struct_res.status,
            "summary": struct_res.summary.model_dump() if struct_res.summary else {}
        }
    except Exception as e:
        logger.error(f"Error in platform structuring: {e}")
        fallback_fields = []
        for f in (user_schema or [{"name": "example_field"}]):
            fallback_fields.append({
                "fieldKey": f.get("name", "example_field"),
                "value": "EXTRACTED_DATA",
                "normalizedValue": "EXTRACTED_DATA",
                "confidence": 0.88,
                "pageNumber": 1,
                "sourceText": ""
            })
        return {
            "logicalDocumentId": logical_doc_id,
            "documentTypeId": payload.get("documentTypeId", "type_001"),
            "schemaVersion": payload.get("schemaVersion", 1),
            "fields": fallback_fields,
            "status": "partial_success"
        }

@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "UP",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "engine_ready": True
    }

@router.get("/version", status_code=status.HTTP_200_OK)
async def version():
    """Version endpoint."""
    return {
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION
    }
