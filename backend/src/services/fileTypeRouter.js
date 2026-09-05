/**
 * Preprocessing File Type Router
 * Normalizes files (PDF, Word, Excel, Images, Text) into one common canonical machine-readable representation.
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
      fileType: ext.replace('.', '') || 'pdf',
      sourceFormat: 'PDF',
      units: []
    };

    if (['.doc', '.docx'].includes(ext)) {
      const parsedWord = await WordParser.parseWordDocument(buffer, filename);
      normalizedResult.sourceFormat = 'WORD';
      normalizedResult.fileType = 'docx';
      normalizedResult.units = [
        {
          unitType: 'SECTION',
          unitNumber: 1,
          text: parsedWord.fullText || '',
          tables: parsedWord.tables || [],
          paragraphs: parsedWord.paragraphs || [],
          confidence: 0.95
        }
      ];

    } else if (['.xls', '.xlsx', '.csv'].includes(ext)) {
      const parsedExcel = await ExcelParser.parseExcelWorkbook(buffer, filename);
      normalizedResult.sourceFormat = 'EXCEL';
      normalizedResult.fileType = ext.replace('.', '');
      normalizedResult.units = (parsedExcel.sheets || []).map((sheet, idx) => ({
        unitType: 'SHEET',
        unitNumber: idx + 1,
        sheetName: sheet.sheetName,
        text: sheet.rows ? sheet.rows.map(r => r.cells.join(' | ')).join('\n') : (parsedExcel.fullText || ''),
        tables: [{ sheetName: sheet.sheetName, rows: sheet.rows || [] }],
        cellRanges: sheet.cellRanges || [],
        confidence: 0.98
      }));

      if (normalizedResult.units.length === 0) {
        normalizedResult.units = [
          {
            unitType: 'SHEET',
            unitNumber: 1,
            sheetName: 'Sheet1',
            text: parsedExcel.fullText || '',
            confidence: 0.95
          }
        ];
      }

    } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'].includes(ext)) {
      normalizedResult.sourceFormat = 'IMAGE';
      normalizedResult.fileType = ext.replace('.', '');
      let imgText = '';
      try {
        const OcrService = require('./ocrService');
        const ocrRes = await OcrService.extractImageText(buffer, filename);
        if (ocrRes && ocrRes.success) imgText = ocrRes.text || '';
      } catch (e) {}

      normalizedResult.units = [
        {
          unitType: 'PAGE',
          unitNumber: 1,
          text: imgText,
          boundingBoxes: [],
          confidence: imgText ? 0.90 : 0.0
        }
      ];

    } else {
      // PDF native or text parsing
      normalizedResult.sourceFormat = ext === '.txt' ? 'TEXT' : 'PDF';
      normalizedResult.fileType = ext.replace('.', '') || 'pdf';
      let textContent = '';
      if (ext === '.txt') {
        textContent = buffer.toString('utf-8');
      }

      normalizedResult.units = [
        {
          unitType: 'PAGE',
          unitNumber: 1,
          text: textContent,
          boundingBoxes: [],
          confidence: textContent ? 0.95 : 0.85
        }
      ];
    }

    return normalizedResult;
  }
}

module.exports = FileTypeRouter;

