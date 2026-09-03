const StructuredDataService = require('./structuredDataService');
const QueryBuilder = require('./queryBuilder');

class SearchService {

  // Full-Text Search
  static async fullTextSearch(organizationId, params = {}) {
    const { q, profileId, documentTypeId, status = 'APPROVED', page = 1, limit = 20 } = params;

    const allRecordsMap = StructuredDataService.getInMemoryRecords();
    const allFieldsMap = StructuredDataService.getInMemoryFields();

    let records = Array.from(allRecordsMap.values())
      .filter(r => r.organizationId === organizationId);

    if (profileId) records = records.filter(r => r.profileId === profileId);
    if (documentTypeId) records = records.filter(r => r.documentTypeId === documentTypeId);
    if (status !== 'ALL') records = records.filter(r => r.status === status);

    // Full-Text Query Filtering
    if (q && q.trim()) {
      const searchTerm = q.trim().toLowerCase();
      records = records.filter(r => {
        // 1. Filename match
        if (r.filename && r.filename.toLowerCase().includes(searchTerm)) return true;

        // 2. Field values match
        const fields = Array.from(allFieldsMap.values()).filter(f => f.structuredRecordId === r.structuredRecordId);
        const matchField = fields.some(f => 
          (f.effectiveValue && String(f.effectiveValue).toLowerCase().includes(searchTerm)) ||
          (f.sourceText && f.sourceText.toLowerCase().includes(searchTerm))
        );

        return matchField;
      });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const total = records.length;
    const startIndex = (pageNum - 1) * limitNum;

    const results = records.slice(startIndex, startIndex + limitNum).map(r => {
      const fieldsMap = {};
      Array.from(allFieldsMap.values())
        .filter(f => f.structuredRecordId === r.structuredRecordId)
        .forEach(f => {
          fieldsMap[f.fieldKey] = f.effectiveValue;
        });

      return {
        structuredRecordId: r.structuredRecordId,
        documentId: r.documentId,
        logicalDocumentId: r.logicalDocumentId,
        filename: r.filename,
        profileId: r.profileId,
        documentTypeId: r.documentTypeId,
        schemaVersionId: r.schemaVersionId,
        status: r.status,
        fields: fieldsMap,
        createdAt: r.createdAt
      };
    });

    return {
      results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  // Dynamic Multi-Filter Search Query (`POST /api/v1/search/query`)
  static async querySearch(organizationId, payload = {}) {
    const {
      profileId,
      documentTypeId,
      search,
      filters = [],
      status = 'APPROVED',
      page = 1,
      limit = 20,
      sort = { field: 'createdAt', direction: 'desc' }
    } = payload;

    const allRecordsMap = StructuredDataService.getInMemoryRecords();
    const allFieldsMap = StructuredDataService.getInMemoryFields();

    let records = Array.from(allRecordsMap.values())
      .filter(r => r.organizationId === organizationId);

    if (profileId) records = records.filter(r => r.profileId === profileId);
    if (documentTypeId) records = records.filter(r => r.documentTypeId === documentTypeId);
    if (status !== 'ALL') records = records.filter(r => r.status === status);

    // Apply text search term
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      records = records.filter(r => {
        if (r.filename && r.filename.toLowerCase().includes(term)) return true;
        const fields = Array.from(allFieldsMap.values()).filter(f => f.structuredRecordId === r.structuredRecordId);
        return fields.some(f => f.effectiveValue && String(f.effectiveValue).toLowerCase().includes(term));
      });
    }

    // Apply dynamic filters
    if (Array.isArray(filters) && filters.length > 0) {
      for (const filter of filters) {
        // Validate filter against queryBuilder security allowlist
        const validFilter = QueryBuilder.validateFilter(filter);

        records = records.filter(r => {
          const fieldRecord = Array.from(allFieldsMap.values()).find(
            f => f.structuredRecordId === r.structuredRecordId && f.fieldKey === validFilter.fieldKey
          );
          return QueryBuilder.evaluateFieldFilter(fieldRecord, validFilter);
        });
      }
    }

    // Safe sorting
    const direction = (sort.direction || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    records.sort((a, b) => {
      const aVal = a[sort.field] || a.createdAt;
      const bVal = b[sort.field] || b.createdAt;
      return aVal > bVal ? direction : aVal < bVal ? -direction : 0;
    });

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const total = records.length;
    const startIndex = (pageNum - 1) * limitNum;

    const results = records.slice(startIndex, startIndex + limitNum).map(r => {
      const fieldsMap = {};
      Array.from(allFieldsMap.values())
        .filter(f => f.structuredRecordId === r.structuredRecordId)
        .forEach(f => {
          fieldsMap[f.fieldKey] = f.effectiveValue;
        });

      return {
        structuredRecordId: r.structuredRecordId,
        documentId: r.documentId,
        logicalDocumentId: r.logicalDocumentId,
        filename: r.filename,
        profileId: r.profileId,
        documentTypeId: r.documentTypeId,
        schemaVersionId: r.schemaVersionId,
        status: r.status,
        fields: fieldsMap,
        createdAt: r.createdAt
      };
    });

    return {
      results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
}

module.exports = SearchService;
