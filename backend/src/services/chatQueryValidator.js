/**
 * Chat Query Validator & Security Layer for Stage 7
 * Enforces Zero Raw SQL execution from AI and validates restricted JSON query plans.
 */

const QueryBuilder = require('./queryBuilder');

const SUPPORTED_INTENTS = Object.freeze([
  'GREETING',
  'SEARCH_RECORDS',
  'COUNT_RECORDS',
  'SUM_FIELD',
  'AVG_FIELD',
  'MIN_FIELD',
  'MAX_FIELD',
  'GROUP_BY_FIELD',
  'GET_RECORD_DETAILS',
  'CLARIFICATION_REQUIRED',
  'EXPLAIN_PLATFORM'
]);

class ChatQueryValidator {

  static validateQueryPlan(queryPlan) {
    if (!queryPlan || typeof queryPlan !== 'object') {
      throw { code: 'INVALID_QUERY_PLAN', message: 'Query plan must be a valid JSON object.' };
    }

    // 1. CRITICAL REJECTION: Inspect for any raw SQL keys or statements
    const jsonStr = JSON.stringify(queryPlan).toLowerCase();
    if (queryPlan.sql || queryPlan.rawSql || /select\s+.*from/i.test(jsonStr) || /drop\s+table/i.test(jsonStr) || /union\s+select/i.test(jsonStr)) {
      throw {
        code: 'RAW_SQL_REJECTED',
        status: 400,
        message: 'Raw SQL returned by AI is forbidden and strictly rejected by the security validator.'
      };
    }

    // 2. Intent Validation
    const intent = (queryPlan.intent || '').toUpperCase();
    if (!SUPPORTED_INTENTS.includes(intent)) {
      throw {
        code: 'UNSUPPORTED_INTENT',
        message: `Intent '${queryPlan.intent}' is unsupported. Allowed intents: ${SUPPORTED_INTENTS.join(', ')}`
      };
    }

    // 3. Limit Cap Validation
    const limit = Math.min(parseInt(queryPlan.limit || 20, 10), 100);

    // 4. Validate Filters Array
    const validatedFilters = [];
    if (Array.isArray(queryPlan.filters)) {
      for (const filter of queryPlan.filters) {
        if (filter.fieldKey && filter.fieldKey !== 'createdAt') {
          const validF = QueryBuilder.validateFilter(filter);
          validatedFilters.push(validF);
        } else {
          validatedFilters.push(filter);
        }
      }
    }

    return {
      intent,
      profileId: queryPlan.profileId || null,
      documentTypeId: queryPlan.documentTypeId || null,
      search: queryPlan.search || null,
      fieldKey: queryPlan.fieldKey || null,
      filters: validatedFilters,
      sort: queryPlan.sort || { field: 'createdAt', direction: 'desc' },
      limit
    };
  }
}

module.exports = ChatQueryValidator;
