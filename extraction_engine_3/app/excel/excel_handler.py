import os
from typing import List, Dict, Any
from app.core.exceptions import CorruptedFileError, ExtractionEngineException
from app.core.logging_config import logger

try:
    import openpyxl
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False


class ExcelHandler:
    """
    Handles Excel spreadsheet (.xlsx, .xls) text extraction.
    Extracts raw cell content (strings, numbers, currency, dates) sheet-by-sheet.
    """

    @staticmethod
    def is_available() -> bool:
        return OPENPYXL_AVAILABLE

    @staticmethod
    def process_excel(excel_path: str) -> List[Dict[str, Any]]:
        """
        Processes an Excel document sheet-by-sheet.
        
        Returns:
            List of per-sheet dicts:
            [
              {
                "page_number": 1,
                "sheet_name": "Sheet1",
                "raw_text": "...",
                "confidence": 1.0
              }, ...
            ]
        """
        if not OPENPYXL_AVAILABLE:
            raise ExtractionEngineException("openpyxl is not installed. Run `pip install openpyxl` to support Excel extraction.")

        sheets_data = []
        try:
            # Load workbook in data_only mode to get calculated cell values
            wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
        except Exception as e:
            raise CorruptedFileError(f"Corrupted or invalid Excel file: {str(e)}")

        sheet_count = 0
        for sheet_name in wb.sheetnames:
            sheet_count += 1
            try:
                sheet = wb[sheet_name]
                row_strings = []

                for row in sheet.iter_rows(values_only=True):
                    # Filter out trailing empty cells
                    cell_values = [str(val).strip() for val in row if val is not None and str(val).strip() != ""]
                    if cell_values:
                        row_strings.append("\t".join(cell_values))

                sheet_text = "\n".join(row_strings)

                sheets_data.append({
                    "page_number": sheet_count,
                    "sheet_name": sheet_name,
                    "raw_text": sheet_text,
                    "confidence": 1.0
                })
            except Exception as e:
                logger.error(f"Error processing sheet '{sheet_name}' in Excel {excel_path}: {e}")
                sheets_data.append({
                    "page_number": sheet_count,
                    "sheet_name": sheet_name,
                    "raw_text": "",
                    "confidence": 0.0,
                    "error": str(e)
                })

        wb.close()

        if not sheets_data:
            raise CorruptedFileError("Excel document contains 0 worksheets.")

        return sheets_data
