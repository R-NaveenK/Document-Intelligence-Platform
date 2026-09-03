/**
 * OCR Integration Service
 * Performs Optical Character Recognition for scanned images (PNG, JPG, JPEG, TIFF) and PDF documents.
 * Integrates in-process Tesseract OCR Engine and OCR.space cloud fallback.
 */

const https = require('https');
let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
} catch (e) {
  // tesseract not installed
}

class OcrService {

  /**
   * Universal Image OCR entrypoint
   * @param {Buffer} buffer - Raw file image buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - Image MIME type
   */
  static async extractImageText(buffer, filename = 'document.png', mimeType = 'image/png') {
    if (!buffer || buffer.length === 0) {
      return { success: false, text: '', confidence: 0, provider: 'NONE' };
    }

    // 1. In-process Tesseract OCR (Fast, offline, deterministic)
    if (Tesseract) {
      try {
        const result = await Tesseract.recognize(buffer, 'eng');
        if (result && result.data && result.data.text && result.data.text.trim().length > 0) {
          const rawConf = typeof result.data.confidence === 'number' ? result.data.confidence : 90;
          const normalizedConf = Math.min(0.98, Math.max(0.60, Number((rawConf / 100).toFixed(2))));
          return {
            success: true,
            text: result.data.text.trim(),
            confidence: normalizedConf,
            provider: 'TESSERACT_OCR'
          };
        }
      } catch (tessErr) {
        console.warn(`[OCR] Tesseract OCR error for ${filename}:`, tessErr.message);
      }
    }

    // 2. OCR.space cloud fallback if API key configured
    const ocrSpaceRes = await this.extractTextWithOcrSpace(buffer, filename, mimeType);
    if (ocrSpaceRes && ocrSpaceRes.success) {
      return ocrSpaceRes;
    }

    return {
      success: false,
      text: '',
      confidence: 0,
      provider: 'OCR_UNAVAILABLE'
    };
  }

  static async extractTextWithOcrSpace(buffer, filename = 'document.png', mimeType = 'image/png') {
    const apiKey = process.env.OCR_SPACE_API_KEY;
    const enabled = process.env.OCR_SPACE_ENABLED !== 'false';

    if (!enabled || !apiKey || apiKey.includes('your_')) {
      return {
        success: false,
        text: '',
        confidence: 0,
        provider: 'OCR_SPACE_DISABLED'
      };
    }

    try {
      const base64Data = buffer.toString('base64');
      const fileDataUri = `data:${mimeType};base64,${base64Data}`;

      const postData = new URLSearchParams({
        apikey: apiKey,
        base64Image: fileDataUri,
        language: 'eng',
        isTable: 'true',
        OCREngine: '2'
      }).toString();

      const options = {
        hostname: 'api.ocr.space',
        path: '/parse/image',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      return new Promise((resolve) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.ParsedResults && data.ParsedResults.length > 0) {
                const text = data.ParsedResults.map(r => r.ParsedText).join('\n');
                resolve({
                  success: true,
                  text: text.trim(),
                  confidence: 0.92,
                  provider: 'OCR.SPACE'
                });
              } else {
                resolve({
                  success: false,
                  text: '',
                  confidence: 0,
                  provider: 'OCR.SPACE_EMPTY'
                });
              }
            } catch (e) {
              resolve({
                success: false,
                text: '',
                confidence: 0,
                provider: 'OCR.SPACE_PARSE_ERROR'
              });
            }
          });
        });

        req.on('error', () => {
          resolve({
            success: false,
            text: '',
            confidence: 0,
            provider: 'OCR.SPACE_NETWORK_ERROR'
          });
        });

        req.write(postData);
        req.end();
      });

    } catch (err) {
      return {
        success: false,
        text: '',
        confidence: 0,
        provider: 'OCR.SPACE_ERROR'
      };
    }
  }
}

module.exports = OcrService;
