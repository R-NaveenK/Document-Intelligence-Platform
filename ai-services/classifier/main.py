from fastapi import FastAPI, HTTPException, status
import uvicorn
import datetime
import os

from models import ClassifyRequest, ClassifyResponse
from service import process_classification

app = FastAPI(
    title="Hybrid Document Classifier Service",
    description="Python FastAPI Service for Document Classification in Intelligent Document Processing Platform",
    version="2.0.0"
)

@app.get("/health")
def health_check():
    return {
        "service": "ai-classifier-service",
        "status": "UP",
        "version": "2.0.0",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

@app.post("/api/v1/classify", response_model=ClassifyResponse)
def classify_document(payload: ClassifyRequest):
    """
    FastAPI Classifier Service Endpoint.
    Receives extracted page texts and frozen schema document types, performs normalized rules,
    RapidFuzz fuzzy similarity, Gemini AI fallback, page boundary detection, and logical document grouping.
    """
    try:
        return process_classification(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Classification error: {str(e)}"
        )

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
