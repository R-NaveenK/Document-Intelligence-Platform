const ChatSchemaService = require('./chatSchemaService');
const GroqService = require('./groqService');

class GeminiQueryPlanner {

  static async generateQueryPlan(organizationId, userMessage, conversationContext = {}) {
    const text = (userMessage || '').trim().toLowerCase();

    // 1. Instant check for simple greetings
    if (/^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b/i.test(text)) {
      return {
        intent: 'GREETING',
        search: null,
        filters: [],
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 0
      };
    }

    // 2. Try Groq AI Query Planning if enabled
    if (GroqService.isEnabled() && process.env.GROQ_API_KEY) {
      try {
        const availableFields = await ChatSchemaService.listOrganizationFields(organizationId);
        const groqPlan = await GroqService.planQueryWithGroq(userMessage, availableFields, conversationContext);
        if (groqPlan && groqPlan.intent) {
          groqPlan.profileId = conversationContext.previousProfileId || groqPlan.profileId || null;
          groqPlan.documentTypeId = conversationContext.previousDocumentTypeId || groqPlan.documentTypeId || null;
          groqPlan.sort = groqPlan.sort || { field: 'createdAt', direction: 'desc' };
          groqPlan.limit = groqPlan.limit || 20;
          return groqPlan;
        }
      } catch (e) {
        console.warn('[QUERY_PLANNER] Groq planning error, using fallback:', e.message);
      }
    }

    // 3. Deterministic Intent & Heuristic Rules Fallback
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let intent = 'SEARCH_RECORDS';
    let search = null;
    let filters = [];
    let fieldKey = null;

    // Product Knowledge & Architecture Inquiries (only when explicitly asked)
    if (
      text.includes('what is this product') ||
      text.includes('about this platform') ||
      text.includes('how does idp work') ||
      text.includes('explain platform') ||
      text.includes('living schema') ||
      text.includes('comparison engine') ||
      text.includes('extraction engine') ||
      text.includes('tech stack') ||
      text.includes('architecture')
    ) {
      return {
        intent: 'EXPLAIN_PLATFORM',
        topic: text,
        filters: [],
        limit: 5
      };
    }

    if (text.includes('how many') || text.includes('count')) {
      intent = 'COUNT_RECORDS';
    } else if (text.includes('average') || text.includes('avg')) {
      intent = 'AVG_FIELD';
      const resolved = await ChatSchemaService.resolveFieldKey(organizationId, text);
      fieldKey = resolved && resolved.fieldKey ? resolved.fieldKey : 'total_amount';
    } else if (text.includes('minimum') || text.includes('min')) {
      intent = 'MIN_FIELD';
      const resolved = await ChatSchemaService.resolveFieldKey(organizationId, text);
      fieldKey = resolved && resolved.fieldKey ? resolved.fieldKey : 'total_amount';
    } else if (text.includes('maximum') || text.includes('max')) {
      intent = 'MAX_FIELD';
      const resolved = await ChatSchemaService.resolveFieldKey(organizationId, text);
      fieldKey = resolved && resolved.fieldKey ? resolved.fieldKey : 'total_amount';
    } else if (/\b(total|sum)\b/.test(text) || text.includes('total sum')) {
      intent = 'SUM_FIELD';
      const resolved = await ChatSchemaService.resolveFieldKey(organizationId, text);
      fieldKey = resolved && resolved.fieldKey ? resolved.fieldKey : 'total_amount';
    } else if (text.includes('group by') || text.includes('by status')) {
      intent = 'GROUP_BY_FIELD';
      fieldKey = 'status';
    }

    // Number extraction for numeric queries (e.g. "above 5000")
    const numMatch = text.match(/(above|greater than|>|more than)\s+(\d+(\.\d+)?)/);
    if (numMatch) {
      const numVal = parseFloat(numMatch[2]);
      const fieldRes = await ChatSchemaService.resolveFieldKey(organizationId, 'amount');
      const targetKey = fieldRes && fieldRes.fieldKey ? fieldRes.fieldKey : 'total_amount';
      filters.push({
        fieldKey: targetKey,
        operator: 'greater_than',
        value: numVal
      });
    }

    // Date extraction (e.g. "this month", "today")
    if (text.includes('this month') || text.includes('current month')) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      filters.push({
        fieldKey: 'createdAt',
        operator: 'between',
        valueMin: monthStart,
        valueMax: todayStr
      });
    } else if (text.includes('today')) {
      filters.push({
        fieldKey: 'createdAt',
        operator: 'equals',
        value: todayStr
      });
    }

    // Text search keyword extraction
    if (text.includes('shipping') || text.includes('vendor') || text.includes('manifest') || text.includes('receipt') || text.includes('invoice')) {
      const kwMatch = text.match(/(shipping|vendor|manifest|receipt|invoice|steel|freight|patient)/);
      if (kwMatch) search = kwMatch[1];
    }

    // Follow-up conversation context refinement: merge previous non-conflicting filters
    if (conversationContext.previousFilters && conversationContext.previousFilters.length > 0) {
      const existingKeys = filters.map(f => f.fieldKey);
      const inherited = conversationContext.previousFilters.filter(pf => !existingKeys.includes(pf.fieldKey));
      filters = [...inherited, ...filters];
    }

    return {
      intent,
      profileId: conversationContext.previousProfileId || null,
      documentTypeId: conversationContext.previousDocumentTypeId || null,
      search,
      filters,
      fieldKey,
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 20
    };
  }
}

module.exports = GeminiQueryPlanner;
