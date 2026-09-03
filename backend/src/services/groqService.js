/**
 * Groq AI Service Layer
 * Connects to Groq Ultra-Fast Inference Cloud (OpenAI-compatible API).
 * Models: openai/gpt-oss-120b, qwen/qwen3.8-27b, groq/compound
 */

const https = require('https');

class GroqService {
  static getApiKey() {
    return process.env.GROQ_API_KEY || '';
  }

  static isEnabled() {
    return process.env.GROQ_ENABLED !== 'false';
  }

  static getModel() {
    return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }

  /**
   * Complete chat messages with Groq LLM
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   */
  static async chatCompletion(messages, options = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const model = options.model || this.getModel();
    const temperature = options.temperature !== undefined ? options.temperature : 0.2;
    const maxTokens = options.maxTokens || 1024;
    const responseFormat = options.jsonMode ? { type: 'json_object' } : undefined;

    const payload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    const postData = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: 'api.groq.com',
        port: 443,
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: options.timeout || 12000
      };

      const req = https.request(reqOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const json = JSON.parse(body);
              const message = json.choices?.[0]?.message;
              resolve({
                content: message?.content || '',
                model: json.model || model,
                usage: json.usage
              });
            } else {
              // Try secondary model fallback if primary was not available
              if (res.statusCode === 404 && model !== 'qwen/qwen3.8-27b') {
                return this.chatCompletion(messages, { ...options, model: 'qwen/qwen3.8-27b' })
                  .then(resolve)
                  .catch(reject);
              }
              reject(new Error(`Groq API returned HTTP ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Groq API response: ${e.message}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Groq API request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Plan a structured document query from natural language using Groq
   */
  static async planQueryWithGroq(userMessage, availableFields = [], conversationContext = {}) {
    const isGreeting = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b/i.test(userMessage.trim());
    if (isGreeting) {
      return {
        intent: 'GREETING',
        search: null,
        fieldKey: null,
        filters: [],
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 0
      };
    }

    const systemPrompt = `You are a query planner for an Intelligent Document Processing platform.
Convert the user's natural language question into a structured JSON query plan.

Available Fields in this organization:
${JSON.stringify(availableFields, null, 2)}

Intents supported:
- "GREETING": User just saying hello or greeting.
- "SEARCH_RECORDS": Find documents/records matching search terms or filters
- "COUNT_RECORDS": Count the number of records
- "SUM_FIELD": Calculate sum of a numeric field (e.g. total_amount, subtotal, tax_amount)
- "AVG_FIELD": Calculate average of a numeric field
- "MIN_FIELD": Find minimum value of a numeric field
- "MAX_FIELD": Find maximum value of a numeric field
- "EXPLAIN_PLATFORM": User asking about the platform, IDP features, living schemas, consensus, multi-engine extraction, or help.

Respond ONLY with a valid JSON object matching this schema:
{
  "intent": "GREETING" | "SEARCH_RECORDS" | "COUNT_RECORDS" | "SUM_FIELD" | "AVG_FIELD" | "MIN_FIELD" | "MAX_FIELD" | "EXPLAIN_PLATFORM",
  "search": string | null,
  "fieldKey": string | null,
  "filters": [
    {
      "fieldKey": string,
      "operator": "equals" | "contains" | "greater_than" | "less_than" | "between",
      "value": any,
      "valueMin": any,
      "valueMax": any
    }
  ],
  "sort": { "field": "createdAt", "direction": "desc" },
  "limit": 20
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    try {
      const completion = await this.chatCompletion(messages, {
        temperature: 0.1,
        jsonMode: true,
        timeout: 8000
      });

      const parsed = JSON.parse(completion.content);
      return parsed;
    } catch (err) {
      console.warn('[GROQ] Groq query planner fallback:', err.message);
      return null;
    }
  }

  /**
   * Synthesize natural language answer from grounded record data using Groq
   */
  static async synthesizeAnswerWithGroq(userMessage, groundedContext) {
    const isGreeting = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b/i.test(userMessage.trim());
    if (isGreeting) {
      return "Hello! 👋 How can I help you with your documents and records today? You can ask me to search files, calculate totals, or inspect extractions.";
    }

    const systemPrompt = `You are the AI Document Intelligence Assistant for an Enterprise IDP Platform.
Answer the user's question clearly, concisely, and accurately based ONLY on the provided document and record context.

Grounding Guidelines:
- If the user asks a simple question, answer concisely in 1-3 sentences.
- Only provide extensive architectural overviews when explicitly requested.
- Highlight key facts, amounts, invoice numbers, receipt numbers, dates, and statuses.
- Format responses using clean, readable markdown (bold, bullet points, code tags).
- Keep answers informative and professional.`;

    const userContent = `User Question:
${userMessage}

Grounded Platform & Record Data:
${JSON.stringify(groundedContext, null, 2)}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    try {
      const completion = await this.chatCompletion(messages, {
        temperature: 0.3,
        timeout: 10000
      });
      return completion.content;
    } catch (err) {
      console.warn('[GROQ] Answer synthesis fallback:', err.message);
      return null;
    }
  }
}

module.exports = GroqService;
