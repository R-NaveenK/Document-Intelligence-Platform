const { v4: uuidv4 } = require('uuid');
const SearchService = require('./searchService');
const StructuredDataService = require('./structuredDataService');
const GeminiQueryPlanner = require('./geminiQueryPlanner');
const ChatQueryValidator = require('./chatQueryValidator');
const ChatSchemaService = require('./chatSchemaService');
const GroqService = require('./groqService');

// In-Memory stores for sessions and messages
const inMemorySessions = new Map();
const inMemoryMessages = new Map();

class ChatService {

  // Create Chat Session
  static async createSession(organizationId, title = 'New AI Chat') {
    const sessionId = uuidv4();
    const session = {
      chatSessionId: sessionId,
      organizationId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemorySessions.set(sessionId, session);
    inMemoryMessages.set(sessionId, []);
    return session;
  }

  // List Chat Sessions
  static async listSessions(organizationId) {
    return Array.from(inMemorySessions.values())
      .filter(s => s.organizationId === organizationId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Get Session Details & Messages History
  static async getSessionHistory(organizationId, sessionId) {
    const session = inMemorySessions.get(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Chat session not found' };
    }

    const messages = inMemoryMessages.get(sessionId) || [];
    return {
      session,
      messages
    };
  }

  // Process User Natural Language Message
  static async processUserMessage(organizationId, payload) {
    const { sessionId, message, profileId, documentTypeId } = payload;

    if (!message || typeof message !== 'string' || !message.trim()) {
      throw { code: 'EMPTY_MESSAGE', message: 'User message cannot be empty' };
    }

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const newSess = await this.createSession(organizationId, message.substring(0, 30));
      activeSessionId = newSess.chatSessionId;
    }

    // 1. Retrieve Conversation Context for Follow-Up queries
    const history = inMemoryMessages.get(activeSessionId) || [];
    const lastAssistantMsg = history.filter(m => m.role === 'assistant' && m.queryPlanJson).pop();
    const prevPlan = lastAssistantMsg ? lastAssistantMsg.queryPlanJson : {};

    const conversationContext = {
      previousProfileId: profileId || prevPlan.profileId,
      previousDocumentTypeId: documentTypeId || prevPlan.documentTypeId,
      previousFilters: prevPlan.filters || []
    };

    // 2. AI Query Planning (Groq / Gemini)
    const rawPlan = await GeminiQueryPlanner.generateQueryPlan(organizationId, message, conversationContext);

    // 3. Backend Security & Validation
    const validPlan = ChatQueryValidator.validateQueryPlan(rawPlan);

    // 4. Query Execution Grounded in Database
    let answerText = '';
    let queryResults = [];
    let aggregateMetric = null;

    const queryData = await SearchService.querySearch(organizationId, {
      profileId: validPlan.profileId,
      documentTypeId: validPlan.documentTypeId,
      search: validPlan.search,
      filters: validPlan.filters,
      sort: validPlan.sort,
      limit: validPlan.limit
    });

    queryResults = queryData.results || [];

    switch (validPlan.intent) {
      case 'GREETING':
        answerText = `Hello! 👋 How can I assist you with your documents, extractions, or spend totals today?`;
        break;

      case 'EXPLAIN_PLATFORM':
        const topic = (validPlan.topic || '').toLowerCase();
        if (topic.includes('living schema')) {
          answerText = `**Living Schema** is our zero-re-upload reprocessing engine. When you add a new custom field to an existing profile (e.g. adding 'Doctor Name' in Schema v2), the engine uses preserved OCR evidence to extract the new field from all historical documents in seconds without re-uploading or paying for OCR again.`;
        } else if (topic.includes('comparison') || topic.includes('engine')) {
          answerText = `Our **Multi-Engine Extraction Ensemble** runs 3 independent engines in parallel:
1. **Engine 1 (Native Parser)**: Fast extraction for digital PDFs, XLSX, and Word.
2. **Engine 2 (Cloud OCR API)**: High-accuracy OCR for scanned images and forms.
3. **Engine 3 (Python Document Engine)**: PyMuPDF / layout-aware document parser.

The **Comparison Engine** scores character clarity (30%), completeness (25%), entity density (25%), and confidence (20%) to arbitrate the highest-quality winner.`;
        } else if (topic.includes('export')) {
          answerText = `We support **5 native export formats**:
- **Excel (XLSX)**: Formatted workbooks with auto-fitted column widths and typed cells.
- **PDF Report**: Vector PDF documents with headers, status badges, and record cards.
- **Word (DOCX)**: OpenXML documents with zebra-striped data tables.
- **CSV**: UTF-8 BOM encoded with formula injection protection.
- **JSON**: Structured records with confidence ratings and schema metadata.`;
        } else {
          answerText = `The **Document Intelligence Platform** is an enterprise end-to-end intelligent document processing system featuring:
- **Processing Profiles & Dynamic Custom Fields**: Define schemas with typed validation rules.
- **Multi-Engine Extraction Ensemble**: Arbitrates between Native, Cloud OCR, and Python engines.
- **Hybrid Classification & Page Grouping**: Categorizes documents and segments multi-page PDFs.
- **Human-in-the-Loop Review Queue**: Inspects flagged anomalies with optimistic locking.
- **Living Schema Reprocessing**: Backfills new fields across historical records with zero re-upload.
- **AI Chat Assistant**: Queries structured records using grounded query planning without SQL injection.`;
        }
        break;

      case 'SEARCH_RECORDS':
        answerText = queryResults.length > 0
          ? `I found ${queryResults.length} matching approved business record(s).`
          : `No approved records matched those search conditions.`;
        break;

      case 'COUNT_RECORDS':
        aggregateMetric = { type: 'COUNT', value: queryData.pagination.total };
        answerText = `There are exactly ${queryData.pagination.total} approved record(s) matching your query.`;
        break;

      case 'SUM_FIELD':
      case 'AVG_FIELD':
      case 'MIN_FIELD':
      case 'MAX_FIELD':
        const targetFieldKey = validPlan.fieldKey || 'total_amount';
        const numValues = [];

        queryResults.forEach(r => {
          const val = r.fields[targetFieldKey];
          if (val !== undefined && val !== null) {
            const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(num)) numValues.push(num);
          }
        });

        if (numValues.length === 0) {
          answerText = `No valid numeric data found for field '${targetFieldKey}' across matching records.`;
          aggregateMetric = { type: validPlan.intent, value: 0 };
        } else {
          let calcValue = 0;
          if (validPlan.intent === 'SUM_FIELD') {
            calcValue = numValues.reduce((acc, curr) => acc + curr, 0);
          } else if (validPlan.intent === 'AVG_FIELD') {
            calcValue = numValues.reduce((acc, curr) => acc + curr, 0) / numValues.length;
          } else if (validPlan.intent === 'MIN_FIELD') {
            calcValue = Math.min(...numValues);
          } else if (validPlan.intent === 'MAX_FIELD') {
            calcValue = Math.max(...numValues);
          }

          calcValue = Math.round(calcValue * 100) / 100;
          aggregateMetric = { type: validPlan.intent, fieldKey: targetFieldKey, value: calcValue };
          answerText = `The calculated ${validPlan.intent.replace('_FIELD', '')} for '${targetFieldKey}' is ${calcValue}.`;
        }
        break;

      case 'GROUP_BY_FIELD':
        answerText = `Grouped records summary generated for ${queryResults.length} item(s).`;
        break;

      default:
        answerText = `Executed search query.`;
        break;
    }

    // 5. Groq Deep Synthesis for conversational and complex queries
    if (GroqService.isEnabled() && process.env.GROQ_API_KEY && validPlan.intent !== 'COUNT_RECORDS' && validPlan.intent !== 'GREETING') {
      try {
        const groqSynthesized = await GroqService.synthesizeAnswerWithGroq(message, {
          queryPlan: validPlan,
          resultsCount: queryResults.length,
          aggregateMetric,
          recordsSample: queryResults.slice(0, 5).map(r => ({
            documentFilename: r.documentFilename,
            fields: r.fields,
            status: r.status,
            createdAt: r.createdAt
          }))
        });
        if (groqSynthesized && groqSynthesized.length > 10) {
          answerText = groqSynthesized;
        }
      } catch (e) {
        console.warn('[CHAT] Groq synthesis fallback:', e.message);
      }
    }

    // Save messages to history
    const userMsg = { messageId: uuidv4(), role: 'user', content: message, createdAt: new Date().toISOString() };
    const assistantMsg = {
      messageId: uuidv4(),
      role: 'assistant',
      content: answerText,
      queryPlanJson: validPlan,
      resultsCount: queryResults.length,
      createdAt: new Date().toISOString()
    };

    const sessMsgs = inMemoryMessages.get(activeSessionId) || [];
    sessMsgs.push(userMsg, assistantMsg);
    inMemoryMessages.set(activeSessionId, sessMsgs);

    return {
      sessionId: activeSessionId,
      answer: answerText,
      intent: validPlan.intent,
      queryPlan: validPlan,
      aggregateMetric,
      results: queryResults,
      resultsCount: queryResults.length
    };
  }
}

module.exports = ChatService;
