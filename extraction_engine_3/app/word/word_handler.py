import os
from typing import List, Dict, Any
from app.core.exceptions import CorruptedFileError, ExtractionEngineException
from app.core.logging_config import logger

try:
    import docx
    PYTHON_DOCX_AVAILABLE = True
except ImportError:
    PYTHON_DOCX_AVAILABLE = False


class WordHandler:
    """
    Handles Microsoft Word document (.docx, .doc) text extraction.
    Extracts raw paragraph text, headings, list items, and table cells.
    """

    @staticmethod
    def is_available() -> bool:
        return PYTHON_DOCX_AVAILABLE

    @staticmethod
    def process_word(word_path: str) -> List[Dict[str, Any]]:
        """
        Processes a Word document.
        
        Returns:
            List of dicts:
            [
              {
                "page_number": 1,
                "raw_text": "...",
                "confidence": 1.0
              }
            ]
        """
        if not PYTHON_DOCX_AVAILABLE:
            raise ExtractionEngineException("python-docx is not installed. Run `pip install python-docx` to support Word document extraction.")

        try:
            doc = docx.Document(word_path)
        except Exception as e:
            raise CorruptedFileError(f"Corrupted or invalid Word document: {str(e)}")

        text_blocks = []

        # 1. Extract paragraphs & headings
        for p in doc.paragraphs:
            cleaned = p.text.strip()
            if cleaned:
                text_blocks.append(cleaned)

        # 2. Extract table contents
        for table in doc.tables:
            for row in table.rows:
                row_values = []
                for cell in row.cells:
                    cell_str = cell.text.strip().replace("\n", " ")
                    if cell_str and (not row_values or row_values[-1] != cell_str):  # Deduplicate merged cells
                        row_values.append(cell_str)
                if row_values:
                    text_blocks.append("\t".join(row_values))

        full_raw_text = "\n".join(text_blocks)

        return [{
            "page_number": 1,
            "raw_text": full_raw_text,
            "confidence": 1.0
        }]
