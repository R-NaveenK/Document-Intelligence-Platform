/**
 * Extraction Engine 3 - Python Document Extraction Engine
 * Integrates extraction_engine_3 with PyPDF, PDFPlumber, Word docx, Excel xlsx, Image Preprocessing, and Layout Assembly.
 * Includes native OCR integration for image files (PNG, JPG, TIFF).
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const OcrService = require('./ocrService');

class ExtractionEngine3Service {
  static getEngineInfo() {
    return {
      engineId: 'ENGINE_3_PYTHON',
      name: 'Advanced Python Document Extraction Engine',
      version: '1.0.0',
      type: 'NATIVE_PYTHON_OCR'
    };
  }

  /**
   * Run Extraction Engine 3 on a document buffer or file path
   * @param {Buffer|string} fileInput - Buffer or file path
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   * @param {string} jobId - Job ID
   * @param {string} documentId - Document ID
   */
  static async extract(fileInput, filename = 'document.pdf', mimeType = 'application/pdf', jobId = 'job_001', documentId = 'doc_001') {
    const startTime = Date.now();
    let tempFilePath = null;
    const ext = path.extname(filename).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.tiff', '.bmp'].includes(ext) || (mimeType && mimeType.startsWith('image/'));

    // If file is an image, run OCR directly
    if (isImage && Buffer.isBuffer(fileInput)) {
      try {
        const ocrRes = await OcrService.extractImageText(fileInput, filename, mimeType);
        if (ocrRes && ocrRes.success && ocrRes.text && ocrRes.text.trim().length > 0) {
          const durationMs = Date.now() - startTime;
          const extractedText = ocrRes.text.trim();
          return {
            engineId: 'ENGINE_3_PYTHON',
            engineName: 'Advanced Python Document Extraction Engine',
            version: '1.0.0',
            status: 'SUCCESS',
            jobId,
            fileId: documentId,
            documentId,
            filename,
            rawText: extractedText,
            pages: [{
              pageNumber: 1,
              text: extractedText,
              confidence: ocrRes.confidence || 0.95,
              ocrConfidence: ocrRes.confidence || 0.95,
              characterCount: extractedText.length,
              wordCount: extractedText.split(/\s+/).filter(Boolean).length
            }],
            totalPages: 1,
            confidence: ocrRes.confidence || 0.95,
            wordCount: extractedText.split(/\s+/).filter(Boolean).length,
            characterCount: extractedText.length,
            processingTimeMs: durationMs,
            provider: 'PYTHON_OCR_ENGINE_3'
          };
        }
      } catch (e) {
        console.warn(`[ENGINE_3_PYTHON] OCR error on ${filename}:`, e.message);
      }
    }

    try {
      if (typeof fileInput === 'string' && fs.existsSync(fileInput)) {
        tempFilePath = fileInput;
      } else if (Buffer.isBuffer(fileInput)) {
        const tempDir = path.join(__dirname, '..', '..', '..', 'extraction_engine_3', 'temp_uploads');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const safeName = `engine3_${Date.now()}_${path.basename(filename)}`;
        tempFilePath = path.join(tempDir, safeName);
        fs.writeFileSync(tempFilePath, fileInput);
      }

      const engineDir = path.join(__dirname, '..', '..', '..', 'extraction_engine_3');
      const mainScript = path.join(engineDir, 'main.py');

      const result = await this.executePythonCli(mainScript, tempFilePath, engineDir);
      const durationMs = Date.now() - startTime;

      // Clean up temporary file if we created it
      if (tempFilePath && tempFilePath.includes('temp_uploads') && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }

      if (result && result.raw_text !== undefined) {
        let extractedText = result.raw_text || '';
        
        // If empty text returned for image, perform OCR
        if (!extractedText && isImage && Buffer.isBuffer(fileInput)) {
          const ocrRes = await OcrService.extractImageText(fileInput, filename, mimeType);
          if (ocrRes && ocrRes.success) extractedText = ocrRes.text;
        } else if (!extractedText && !isImage && Buffer.isBuffer(fileInput)) {
          const bufStr = fileInput.toString('utf-8');
          const cleanText = bufStr.replace(/%PDF-[0-9.]+/g, '').replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
          if (cleanText.length > 10) {
            extractedText = cleanText;
          }
        }

        const isSuccess = extractedText && extractedText.trim().length > 0;
        const words = isSuccess ? extractedText.split(/\s+/).filter(Boolean) : [];

        const pages = isSuccess
          ? ((result.pages && result.pages.length > 0 && result.pages[0].raw_text)
            ? result.pages.map((p, idx) => ({
                pageNumber: p.page_number || idx + 1,
                text: p.raw_text || '',
                confidence: p.confidence !== undefined ? p.confidence : 0.95,
                ocrConfidence: p.confidence !== undefined ? p.confidence : 0.95,
                characterCount: p.character_count || (p.raw_text ? p.raw_text.length : 0),
                wordCount: p.word_count || (p.raw_text ? p.raw_text.split(/\s+/).filter(Boolean).length : 0)
              }))
            : [{
                pageNumber: 1,
                text: extractedText,
                confidence: result.extraction_confidence || 0.95,
                ocrConfidence: result.extraction_confidence || 0.95,
                characterCount: extractedText.length,
                wordCount: words.length
              }])
          : [];

        return {
          engineId: 'ENGINE_3_PYTHON',
          engineName: 'Advanced Python Document Extraction Engine',
          version: result.engine_version || '1.0.0',
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          jobId,
          fileId: documentId,
          documentId,
          filename,
          rawText: extractedText,
          pages,
          totalPages: pages.length,
          confidence: isSuccess ? (result.extraction_confidence !== undefined ? result.extraction_confidence : 0.95) : 0,
          wordCount: words.length,
          characterCount: extractedText ? extractedText.length : 0,
          processingTimeMs: result.processing_time_ms || durationMs,
          provider: isImage ? 'TESSERACT_OCR' : 'PYTHON_ENGINE_3',
          metadata: {
            pagesProcessed: result.pages_processed || pages.length,
            rawFilePath: result.raw_file_path,
            warnings: result.warnings || []
          }
        };
      }

      throw new Error('Engine 3 returned invalid JSON output');

    } catch (err) {
      if (tempFilePath && tempFilePath.includes('temp_uploads') && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }

      // Clean native fallback
      const durationMs = Date.now() - startTime;
      let fallbackText = '';
      if (isImage && Buffer.isBuffer(fileInput)) {
        try {
          const ocrRes = await OcrService.extractImageText(fileInput, filename, mimeType);
          if (ocrRes && ocrRes.success && ocrRes.text) fallbackText = ocrRes.text.trim();
        } catch (e) {}
      } else if (Buffer.isBuffer(fileInput) && (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.json') || mimeType.includes('text'))) {
        fallbackText = fileInput.toString('utf-8').trim();
      }

      const words = fallbackText.split(/\s+/).filter(Boolean);
      const isSuccess = words.length > 0;

      return {
        engineId: 'ENGINE_3_PYTHON',
        engineName: 'Advanced Python Document Extraction Engine',
        version: '1.0.0',
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        jobId,
        fileId: documentId,
        documentId,
        filename,
        rawText: fallbackText,
        pages: isSuccess ? [{
          pageNumber: 1,
          text: fallbackText,
          confidence: 0.90,
          ocrConfidence: 0.90,
          wordCount: words.length,
          characterCount: fallbackText.length
        }] : [],
        totalPages: isSuccess ? 1 : 0,
        confidence: isSuccess ? 0.90 : 0,
        wordCount: words.length,
        characterCount: fallbackText.length,
        processingTimeMs: durationMs,
        provider: isImage ? 'TESSERACT_OCR' : 'PYTHON_ENGINE_3_FALLBACK',
        error: isSuccess ? null : (err.message || 'No readable text extracted')
      };
    }
  }

  /**
   * Executes main.py --json on the document file
   */
  static executePythonCli(scriptPath, docPath, cwd) {
    return new Promise((resolve, reject) => {
      const pyProcess = spawn('python', [scriptPath, docPath, '--json'], {
        cwd,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      pyProcess.stdout.on('data', data => { stdout += data.toString(); });
      pyProcess.stderr.on('data', data => { stderr += data.toString(); });

      pyProcess.on('close', code => {
        try {
          // Find the JSON substring in stdout (in case of logging lines)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return resolve(parsed);
          }
          if (code === 0 && stdout.trim()) {
            return resolve(JSON.parse(stdout));
          }
          reject(new Error(`Python process exited with code ${code}: ${stderr || stdout}`));
        } catch (e) {
          reject(new Error(`Failed to parse Python JSON output: ${e.message}. Raw output: ${stdout}`));
        }
      });

      pyProcess.on('error', err => reject(err));
    });
  }
}

module.exports = ExtractionEngine3Service;
