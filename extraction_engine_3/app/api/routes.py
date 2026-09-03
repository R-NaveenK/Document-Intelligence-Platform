from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from typing import Optional
from app.engine import ExtractionEngine
from app.models.extraction_result import ExtractionResult
from app.core.exceptions import InvalidInputError, UnsupportedFileError, CorruptedFileError
from app.core.logging_config import logger

router = APIRouter()

# Instantiate single reusable ExtractionEngine for HTTP wrapper
_extraction_engine = ExtractionEngine()


@router.post("/extract", response_model=ExtractionResult, status_code=status.HTTP_200_OK)
async def extract_document(
    file: UploadFile = File(..., description="Document file (PDF, JPG, PNG, TIFF)"),
    document_id: Optional[str] = Form(None, description="Optional document tracking ID"),
    language: Optional[str] = Form(None, description="Optional language parameter")
):
    """
    Extracts raw unstructured text and numerical content from uploaded document.
    
    Accepts:
    - multipart/form-data upload
    
    Returns:
    - ExtractionResult JSON object matching standard contract.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided in request."
        )

    try:
        # Read file bytes safely
        contents = await file.read()
        
        options = {}
        if language:
            options["language"] = language

        result = _extraction_engine.extract(
            document=contents,
            original_filename=file.filename,
            document_id=document_id,
            options=options
        )
        return result

    except InvalidInputError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except UnsupportedFileError as e:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=e.message)
    except CorruptedFileError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    except Exception as e:
        logger.error(f"Unexpected API extraction error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {str(e)}"
        )


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """
    Health check endpoint.
    Reflects engine readiness without loading a new OCR model on every call.
    """
    return _extraction_engine.health_check()


@router.get("/version", status_code=status.HTTP_200_OK)
async def get_version():
    """Returns engine version and ID."""
    return {
        "engine_id": _extraction_engine.get_engine_id(),
        "version": _extraction_engine.get_version()
    }
