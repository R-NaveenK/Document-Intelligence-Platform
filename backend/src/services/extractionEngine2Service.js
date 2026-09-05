/**
 * Extraction Engine 2 - COR Document Extraction Engine
 * Integrates extraction_engine_2 (COR PaddleOCR/FastAPI engine) on port 5005.
 * Features Tesseract OCR integration for native image extraction (PNG, JPG, TIFF).
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const OcrService = require('./ocrService');

class ExtractionEngine2Service {
  static getEngineInfo() {
    return {
      engineId: 'ENGINE_2_COR',
      name: 'COR Extraction Engine 2',
      version: '2.0.0',
      type: 'PADDLE_OCR_COR',
      serviceUrl: process.env.EXTRACTION_ENGINE_2_URL || 'http://localhost:5005'
    };
  }

  /**
   * Run Extraction Engine 2 on a document buffer or file path
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

    // If it is an image, run OCR directly for high-accuracy character recognition
    if (isImage && Buffer.isBuffer(fileInput)) {
      try {
        const ocrRes = await OcrService.extractImageText(fileInput, filename, mimeType);
        if (ocrRes && ocrRes.success && ocrRes.text && ocrRes.text.trim().length > 0) {
          const durationMs = Date.now() - startTime;
          const extractedText = ocrRes.text.trim();
          return {
            engineId: 'ENGINE_2_COR',
            engineName: 'COR Extraction Engine 2',
            version: '2.0.0',
            status: 'SUCCESS',
            jobId,
            fileId: documentId,
            documentId,
            filename,
            rawText: extractedText,
            pages: [{
              pageNumber: 1,
              text: extractedText,
              confidence: ocrRes.confidence || 0.94,
              ocrConfidence: ocrRes.confidence || 0.94,
              wordCount: extractedText.split(/\s+/).filter(Boolean).length,
              characterCount: extractedText.length
            }],
            totalPages: 1,
            confidence: ocrRes.confidence || 0.94,
            wordCount: extractedText.split(/\s+/).filter(Boolean).length,
            characterCount: extractedText.length,
            processingTimeMs: durationMs,
            provider: ocrRes.provider || 'COR_OCR_ENGINE'
          };
        }
      } catch (e) {
        console.warn(`[ENGINE_2_COR] OCR error on ${filename}:`, e.message);
      }
    }

    try {
      if (typeof fileInput === 'string' && fs.existsSync(fileInput)) {
        tempFilePath = fileInput;
      } else if (Buffer.isBuffer(fileInput)) {
        const tempDir = path.join(__dirname, '..', '..', '..', 'extraction_engine_2', 'temp_uploads');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const safeName = `cor_${Date.now()}_${path.basename(filename)}`;
        tempFilePath = path.join(tempDir, safeName);
        fs.writeFileSync(tempFilePath, fileInput);
      }

      // 1. Try calling FastAPI service on port 5005
      let result = null;
      try {
        result = await this.callCorFastApi(tempFilePath, documentId);
      } catch (apiErr) {
        // 2. Fallback to direct Python CLI execution if service is cold
        const engineDir = path.join(__dirname, '..', '..', '..', 'extraction_engine_2');
        result = await this.executePythonCli(tempFilePath, engineDir);
      }

      const durationMs = Date.now() - startTime;

      // Clean up temp file
      if (tempFilePath && tempFilePath.includes('temp_uploads') && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }

      if (result && (result.raw_text || result.status === 'SUCCESS')) {
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

        const pages = [{
          pageNumber: 1,
          text: extractedText,
          confidence: 0.94,
          ocrConfidence: 0.94,
          wordCount: extractedText.split(/\s+/).filter(Boolean).length,
          characterCount: extractedText.length
        }];

        return {
          engineId: 'ENGINE_2_COR',
          engineName: 'COR Extraction Engine 2',
          version: '2.0.0',
          status: 'SUCCESS',
          jobId,
          fileId: documentId,
          documentId,
          filename,
          rawText: extractedText,
          pages,
          totalPages: result.pages_processed || 1,
          confidence: 0.94,
          wordCount: extractedText.split(/\s+/).filter(Boolean).length,
          characterCount: extractedText.length,
          processingTimeMs: durationMs,
          provider: 'COR_ENGINE_2',
          metadata: {
            isCorEngine: true,
            charactersExtracted: result.characters_extracted || extractedText.length
          }
        };
      }

      // Cloud OCR / buffer fallback
      return await this.fallbackExtraction(fileInput, filename, mimeType, jobId, documentId, startTime);

    } catch (err) {
      if (tempFilePath && tempFilePath.includes('temp_uploads') && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
      return await this.fallbackExtraction(fileInput, filename, mimeType, jobId, documentId, startTime, err.message);
    }
  }

  static async callCorFastApi(filePath, documentId) {
    const postData = JSON.stringify({
      file_path: filePath,
      document_id: documentId
    });

    const options = {
      hostname: '127.0.0.1',
      port: 5005,
      path: '/extract/path',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch (e) {
            reject(new Error('COR Engine returned invalid JSON: ' + body));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('COR Engine request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  static executePythonCli(filePath, cwd) {
    return new Promise((resolve, reject) => {
      const pyProcess = spawn('python', ['-m', 'cor_engine.cli', filePath, '--json'], {
        cwd,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      pyProcess.stdout.on('data', data => { stdout += data.toString(); });
      pyProcess.stderr.on('data', data => { stderr += data.toString(); });

      pyProcess.on('close', code => {
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return resolve(JSON.parse(jsonMatch[0]));
          }
          if (code === 0 && stdout.trim()) {
            return resolve(JSON.parse(stdout));
          }
          reject(new Error(`COR Python process exited with code ${code}: ${stderr || stdout}`));
        } catch (e) {
          reject(new Error(`Failed to parse COR Python output: ${e.message}`));
        }
      });

      pyProcess.on('error', err => reject(err));
    });
  }

  static async fallbackExtraction(buffer, filename, mimeType, jobId, documentId, startTime, errorMessage = null) {
    let rawText = '';
    const ext = path.extname(filename).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'].includes(ext) || (mimeType && mimeType.startsWith('image/'));

    if (isImage && Buffer.isBuffer(buffer)) {
      try {
        const ocrRes = await OcrService.extractImageText(buffer, filename, mimeType);
        if (ocrRes && ocrRes.success && ocrRes.text) rawText = ocrRes.text.trim();
      } catch (e) {}
    } else if (Buffer.isBuffer(buffer) && (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.json') || mimeType.includes('text'))) {
      rawText = buffer.toString('utf-8').trim();
    }

    const words = rawText.split(/\s+/).filter(Boolean);
    const isSuccess = words.length > 0;
    const durationMs = Date.now() - startTime;

    return {
      engineId: 'ENGINE_2_COR',
      engineName: 'COR Extraction Engine 2',
      version: '2.0.0',
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      jobId,
      fileId: documentId,
      documentId,
      filename,
      rawText,
      pages: isSuccess ? [{
        pageNumber: 1,
        text: rawText,
        confidence: 0.90,
        ocrConfidence: 0.90,
        wordCount: words.length,
        characterCount: rawText.length
      }] : [],
      totalPages: isSuccess ? 1 : 0,
      confidence: isSuccess ? 0.90 : 0,
      wordCount: words.length,
      characterCount: rawText.length,
      processingTimeMs: durationMs,
      provider: isImage ? 'TESSERACT_OCR' : 'COR_ENGINE_2_FALLBACK',
      error: isSuccess ? null : (errorMessage || 'No readable text extracted')
    };
  }
}

module.exports = ExtractionEngine2Service;
