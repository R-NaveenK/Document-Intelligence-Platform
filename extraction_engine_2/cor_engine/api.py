"""FastAPI REST interface for COR extraction engine."""
import logging
from pathlib import Path
import shutil
import tempfile
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from cor_engine.core.engine import CORExtractionEngine
from cor_engine.core.result import ExtractionResult

logger = logging.getLogger("cor_engine.api")

app = FastAPI(
    title="COR Extraction Engine API",
    description="Independent Document Extraction Engine (PaddleOCR-based)",
    version="1.0.0",
)

engine = CORExtractionEngine()


class PathExtractRequest(BaseModel):
    file_path: str = Field(..., description="Local filesystem path to the document")
    document_id: Optional[str] = Field(None, description="Optional unique document identifier")


@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint for orchestration layer."""
    return engine.health_check()


@app.get("/capabilities", tags=["System"])
def get_capabilities():
    """Expose COR extraction capabilities and supported file formats."""
    return engine.get_capabilities()



@app.post("/extract", response_model=ExtractionResult, tags=["Extraction"])
async def extract_uploaded_document(
    file: UploadFile = File(..., description="The document file to extract"),
    document_id: Optional[str] = Form(None, description="Optional document ID")
):
    """Extract all unstructured text and numerical data from an uploaded document file.

    Supports PDF, DOC, DOCX, TXT, JPG, JPEG, and PNG.
    Saves raw .txt artifact and returns standardized extraction metadata.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file missing filename")

    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = Path(temp_file.name)
        shutil.copyfileobj(file.file, temp_file)

    try:
        doc_id = document_id or Path(file.filename).stem
        result = engine.extract(input_file=temp_path, document_id=doc_id)
        return result
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


@app.post("/extract/path", response_model=ExtractionResult, tags=["Extraction"])
def extract_by_filepath(request: PathExtractRequest):
    """Extract document directly from host filesystem path (for service-to-service orchestration)."""
    file_path = Path(request.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {request.file_path}"
        )

    result = engine.extract(input_file=file_path, document_id=request.document_id)
    return result
