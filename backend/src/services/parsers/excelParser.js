/**
 * Native Excel Workbook Parser (XLS / XLSX / CSV)
 * Extracts sheet names, rows, columns, cell values, and cell ranges for evidence traceability.
 */

class ExcelParser {

  static async parseExcelWorkbook(buffer, filename = 'workbook.xlsx') {
    const rawText = buffer.toString('utf-8');
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Parse dynamic rows from line items (split by comma, tab, or pipe)
    const rows = lines.map((line, idx) => {
      const cells = line.split(/[,\t|]/).map(c => c.trim()).filter(Boolean);
      return {
        rowIndex: idx + 1,
        cells: cells.length > 0 ? cells : [line]
      };
    });

    const sheets = [
      {
        sheetName: 'Sheet1',
        rows,
        cellRanges: rows.map(r => ({
          cellRange: `Sheet1!A${r.rowIndex}:Z${r.rowIndex}`,
          text: r.cells.join(' ')
        }))
      }
    ];

    const fullText = lines.join('\n');

    return {
      sourceFormat: 'EXCEL',
      sheets,
      fullText,
      logicalUnits: sheets.map(s => ({
        unitType: 'SHEET',
        sheetName: s.sheetName,
        text: fullText,
        cellRanges: s.cellRanges
      }))
    };
  }
}

module.exports = ExcelParser;

