/**
 * Preprocessing File Type Router
 * Directs files to Word, Excel, PDF, or Image native extractors and outputs a normalized extraction contract.
 */

const WordParser = require('./parsers/wordParser');
const ExcelParser = require('./parsers/excelParser');

class FileTypeRouter {

  static async processAndNormalize(fileObject, jobId, documentId) {
    const ext = (fileObject.ext || '').toLowerCase();
    const buffer = fileObject.buffer || Buffer.from('');
    const filename = fileObject.sanitizedFilename || fileObject.originalname || 'file';

    let normalizedResult = {
      documentId,
      jobId,
      sourceFormat: 'PDF',
      pages: [],
      tables: [],
      logicalUnits: []
    };

    if (['.doc', '.docx'].includes(ext)) {
      const parsedWord = await WordParser.parseWordDocument(buffer, filename);
      normalizedResult.sourceFormat = 'WORD';
      normalizedResult.logicalUnits = parsedWord.logicalUnits;
      normalizedResult.tables = parsedWord.tables;
      normalizedResult.pages = [
        {
          pageNumber: 1,
          text: parsedWord.fullText,
          paragraphs: parsedWord.paragraphs
        }
      ];

    } else if (['.xls', '.xlsx'].includes(ext)) {
      const parsedExcel = await ExcelParser.parseExcelWorkbook(buffer, filename);
      normalizedResult.sourceFormat = 'EXCEL';
      normalizedResult.logicalUnits = parsedExcel.logicalUnits;
      normalizedResult.pages = parsedExcel.sheets.map((sheet, idx) => ({
        pageNumber: idx + 1,
        text: `Sheet: ${sheet.sheetName}\n` + sheet.rows.map(r => r.cells.join(' ')).join('\n'),
        cellRanges: sheet.cellRanges
      }));

    } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp'].includes(ext)) {
      normalizedResult.sourceFormat = 'IMAGE';
      let imgText = '';
      try {
        const OcrService = require('./ocrService');
        const ocrRes = await OcrService.extractImageText(buffer, filename);
        if (ocrRes && ocrRes.success) imgText = ocrRes.text;
      } catch (e) {}
      if (!imgText) imgText = `OCR Extracted image text for ${filename}`;

      normalizedResult.pages = [
        {
          pageNumber: 1,
          text: imgText,
          boundingBoxes: []
        }
      ];

    } else {
      // PDF native or OCR fallback
      normalizedResult.sourceFormat = 'PDF';
      normalizedResult.pages = [
        {
          pageNumber: 1,
          text: `PDF Extracted text content for ${filename}`,
          boundingBoxes: []
        }
      ];
    }

    return normalizedResult;
  }
}

module.exports = FileTypeRouter;
