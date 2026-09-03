const fs = require('fs');
const path = require('path');

class StorageService {
  constructor() {
    this.baseStorageDir = process.env.STORAGE_LOCAL_PATH || path.join(__dirname, '../../../storage');
  }

  // Get absolute local filesystem directory for document
  getDocumentDir(organizationId, documentId) {
    return path.join(this.baseStorageDir, 'organizations', organizationId, 'documents', documentId);
  }

  // Get relative storage key
  getStorageKey(organizationId, documentId, ext = 'pdf') {
    const cleanExt = ext.replace(/^\.+/, '') || 'bin';
    return `organizations/${organizationId}/documents/${documentId}/original.${cleanExt}`;
  }

  // Store file binary buffer using storage abstraction
  async storeFile(organizationId, documentId, buffer, originalFilename) {
    const ext = path.extname(originalFilename || '') || '.bin';
    const docDir = this.getDocumentDir(organizationId, documentId);
    
    // Ensure parent directories exist
    fs.mkdirSync(docDir, { recursive: true });

    const targetPath = path.join(docDir, `original${ext}`);
    fs.writeFileSync(targetPath, buffer);

    const storageKey = this.getStorageKey(organizationId, documentId, ext);
    return {
      storageKey,
      bytesStored: buffer.length,
      absolutePath: targetPath
    };
  }

  // Retrieve stored file
  async getFile(organizationId, documentId) {
    const docDir = this.getDocumentDir(organizationId, documentId);
    if (!fs.existsSync(docDir)) {
      throw new Error(`Storage path not found for document ${documentId}`);
    }

    const files = fs.readdirSync(docDir);
    const targetFile = files.find(f => f.startsWith('original.'));
    if (!targetFile) {
      throw new Error(`Original file not found in storage for document ${documentId}`);
    }

    const fullPath = path.join(docDir, targetFile);
    const buffer = fs.readFileSync(fullPath);
    return {
      buffer,
      filename: targetFile,
      fullPath
    };
  }

  // Delete stored file
  async deleteFile(organizationId, documentId) {
    const docDir = this.getDocumentDir(organizationId, documentId);
    if (fs.existsSync(docDir)) {
      fs.rmSync(docDir, { recursive: true, force: true });
    }
    return true;
  }
}

module.exports = new StorageService();
