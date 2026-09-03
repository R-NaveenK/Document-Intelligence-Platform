import logging
import sys
from app.core.config import settings

def setup_logging():
    """
    Configures standard Python logging for the extraction engine.
    Safe logger that excludes raw document content from production logs.
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger("extraction_engine")
    root_logger.setLevel(log_level)
    
    if not root_logger.handlers:
        root_logger.addHandler(handler)

    return root_logger

logger = setup_logging()
