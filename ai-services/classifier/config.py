import os

class Settings:
    HIGH_CONFIDENCE_THRESHOLD: float = float(os.getenv("CLASSIFICATION_HIGH_CONFIDENCE_THRESHOLD", "0.85"))
    REVIEW_THRESHOLD: float = float(os.getenv("CLASSIFICATION_REVIEW_THRESHOLD", "0.70"))
    
    KEYWORD_WEIGHT: float = float(os.getenv("CLASSIFIER_KEYWORD_WEIGHT", "0.40"))
    FUZZY_WEIGHT: float = float(os.getenv("CLASSIFIER_FUZZY_WEIGHT", "0.40"))
    AI_WEIGHT: float = float(os.getenv("CLASSIFIER_AI_WEIGHT", "0.20"))
    
    OCR_CONFIDENCE_WEIGHT: float = float(os.getenv("OCR_CONFIDENCE_WEIGHT", "0.15"))
    
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_ENABLED: bool = os.getenv("GEMINI_ENABLED", "false").lower() in ("true", "1", "yes")

settings = Settings()
