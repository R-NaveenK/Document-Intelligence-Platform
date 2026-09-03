import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.config import settings
from app.core.logging_config import logger

app = FastAPI(
    title="Extraction Engine 1 Service",
    description="Independent Document Extraction Engine (Engine 1) for Intelligent Document Processing Platform",
    version=settings.ENGINE_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    logger.info(f"Starting Extraction Engine 1 on http://{settings.API_HOST}:{settings.API_PORT}")
    uvicorn.run(
        "run:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=False
    )
