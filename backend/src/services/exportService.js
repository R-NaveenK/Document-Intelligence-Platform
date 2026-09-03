const { v4: uuidv4 } = require('uuid');
const SearchService = require('./searchService');
const ExportGenerators = require('./exportGenerators');
const ProfileService = require('./profileService');

// In-Memory store for export jobs and file buffers
const inMemoryExportJobs = new Map();
const inMemoryExportBuffers = new Map();

class ExportService {

  // Create & Process Export Job
  static async createExportJob(organizationId, payload = {}) {
    const {
      format = 'CSV',
      profileId,
      documentTypeId,
      recordIds = [],
      filters = [],
      includeMetadata = true,
      includeConfidence = false,
      includeValidationStatus = false
    } = payload;

    const validFormat = format.toUpperCase();
    if (!['CSV', 'XLSX', 'JSON', 'PDF', 'DOCX'].includes(validFormat)) {
      throw { code: 'UNSUPPORTED_FORMAT', message: `Export format '${format}' is not supported.` };
    }

    const exportJobId = uuidv4();
    const job = {
      exportJobId,
      organizationId,
      format: validFormat,
      profileId: profileId || null,
      documentTypeId: documentTypeId || null,
      requestConfig: payload,
      status: 'PROCESSING',
      recordCount: 0,
      filename: `export_${validFormat.toLowerCase()}_${Date.now()}.${validFormat === 'XLSX' ? 'xlsx' : validFormat.toLowerCase()}`,
      fileSize: 0,
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    inMemoryExportJobs.set(exportJobId, job);

    // Fetch records scoped to tenant
    const searchRes = await SearchService.querySearch(organizationId, {
      profileId,
      documentTypeId,
      filters,
      status: 'APPROVED',
      limit: 100
    });

    let records = searchRes.results || [];

    // Filter to selected recordIds if explicitly provided
    if (Array.isArray(recordIds) && recordIds.length > 0) {
      records = records.filter(r => recordIds.includes(r.structuredRecordId));
    }

    job.recordCount = records.length;

    // Generate File Content
    let fileBuffer;
    const opts = { includeMetadata, includeConfidence, includeValidationStatus };

    switch (validFormat) {
      case 'CSV':
        fileBuffer = await ExportGenerators.generateCSV(records, opts);
        break;
      case 'XLSX':
        fileBuffer = await ExportGenerators.generateExcel(records, opts);
        break;
      case 'JSON':
        fileBuffer = await ExportGenerators.generateJSON(records, opts);
        break;
      case 'PDF':
        fileBuffer = await ExportGenerators.generatePDF(records, opts);
        break;
      case 'DOCX':
        fileBuffer = await ExportGenerators.generateWord(records, opts);
        break;
    }

    job.fileSize = fileBuffer.length;
    job.status = 'COMPLETED';
    job.completedAt = new Date().toISOString();

    inMemoryExportJobs.set(exportJobId, job);
    inMemoryExportBuffers.set(exportJobId, fileBuffer);

    ProfileService.recordAudit(organizationId, null, 'EXPORT_CREATED', 'EXPORT_JOB', exportJobId, {
      format: validFormat,
      recordCount: records.length
    });

    return job;
  }

  // Get Export Job Status
  static async getExportJob(organizationId, exportJobId) {
    const job = inMemoryExportJobs.get(exportJobId);
    if (!job || job.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Export job not found' };
    }
    return job;
  }

  // List Export History
  static async listExportHistory(organizationId) {
    return Array.from(inMemoryExportJobs.values())
      .filter(j => j.organizationId === organizationId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Download Export File
  static async downloadExportFile(organizationId, exportJobId) {
    const job = await this.getExportJob(organizationId, exportJobId);
    if (job.status !== 'COMPLETED') {
      throw { code: 'EXPORT_NOT_READY', message: 'Export file generation is not completed yet.' };
    }

    const buffer = inMemoryExportBuffers.get(exportJobId);
    if (!buffer) {
      throw { code: 'FILE_NOT_FOUND', message: 'Generated export file buffer not found.' };
    }

    return {
      job,
      buffer
    };
  }

  // Delete Individual Export Job
  static async deleteExportJob(organizationId, exportJobId) {
    const job = inMemoryExportJobs.get(exportJobId);
    if (!job || job.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', status: 404, message: 'Export job not found' };
    }
    inMemoryExportJobs.delete(exportJobId);
    inMemoryExportBuffers.delete(exportJobId);
    return { deleted: true, exportJobId };
  }

  // Clear All Export History
  static async clearAllExports(organizationId) {
    let count = 0;
    for (const [id, job] of inMemoryExportJobs.entries()) {
      if (job.organizationId === organizationId) {
        inMemoryExportJobs.delete(id);
        inMemoryExportBuffers.delete(id);
        count++;
      }
    }
    return { clearedCount: count };
  }
}

module.exports = ExportService;
