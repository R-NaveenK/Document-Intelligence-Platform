/**
 * Dynamic User-Defined Field Extraction & Consensus Engine
 * Performs 7-step extraction cascade, alias auto-generation, and cross-engine field-level consensus with full provenance.
 */

class FieldExtractionService {

  /**
   * Auto-generate candidate aliases for a field definition if not explicitly provided
   */
  static generateAliases(fieldDef) {
    const aliases = new Set();
    const key = (fieldDef.fieldKey || fieldDef.key || '').trim();
    const displayName = (fieldDef.displayName || fieldDef.name || '').trim();

    if (Array.isArray(fieldDef.aliases)) {
      fieldDef.aliases.forEach(a => {
        if (a && typeof a === 'string' && a.trim()) aliases.add(a.trim());
      });
    }

    if (displayName) {
      aliases.add(displayName);
      aliases.add(displayName.toLowerCase());
      aliases.add(displayName.toUpperCase());
    }

    if (key) {
      aliases.add(key);
      const spaced = key.replace(/[-_]+/g, ' ');
      aliases.add(spaced);
      aliases.add(spaced.toLowerCase());
      aliases.add(spaced.toUpperCase());

      // Title case
      const titleCase = spaced.replace(/\b\w/g, c => c.toUpperCase());
      aliases.add(titleCase);

      // Common shorthand mappings
      if (key.includes('reference') || key.includes('ref')) {
        aliases.add('Ref No');
        aliases.add('Reference No');
        aliases.add('Ref #');
      }
      if (key.includes('number') || key.includes('num')) {
        aliases.add(spaced.replace(/number/i, 'No.'));
        aliases.add(spaced.replace(/number/i, '#'));
      }
      if (key.includes('date')) {
        aliases.add(spaced.replace(/date/i, 'Dt.'));
      }
    }

    return Array.from(aliases).sort((a, b) => b.length - a.length);
  }

  /**
   * Normalize a value for consensus comparison
   */
  static normalizeForComparison(val, dataType = 'string') {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    if (!str) return null;

    const type = (dataType || 'string').toLowerCase();

    if (type === 'decimal' || type === 'number' || type === 'integer' || type === 'float') {
      // Remove currency symbols, commas, and whitespace
      const cleanNum = str.replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleanNum);
      if (isNaN(num)) return str.toLowerCase();
      return type === 'integer' ? String(Math.round(num)) : num.toFixed(2);
    }

    if (type === 'date') {
      // Match ISO date YYYY-MM-DD
      const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
      if (isoMatch) {
        const y = isoMatch[1];
        const m = String(isoMatch[2]).padStart(2, '0');
        const d = String(isoMatch[3]).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      // Match DD/MM/YYYY or MM/DD/YYYY
      const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (dmyMatch) {
        const d = String(dmyMatch[1]).padStart(2, '0');
        const m = String(dmyMatch[2]).padStart(2, '0');
        const y = dmyMatch[3];
        return `${y}-${m}-${d}`;
      }
      return str.toLowerCase();
    }

    if (type === 'boolean') {
      const lower = str.toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(lower)) return 'true';
      if (['false', '0', 'no', 'n'].includes(lower)) return 'false';
    }

    // Default string: collapse repeated whitespace, trim
    return str.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Extract a single field candidate from document text using the 7-step cascade
   */
  static extractFieldCandidate(fieldDef, text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { value: null, confidence: 0.0, step: 'NO_TEXT', evidence: null };
    }

    const key = (fieldDef.fieldKey || fieldDef.key || '').toLowerCase();
    const dataType = (fieldDef.dataType || fieldDef.type || 'string').toLowerCase();
    const aliases = this.generateAliases(fieldDef);

    // Stop words / boundary lookaheads that terminate value extraction
    const boundaryLookahead = `(?=(?:\\r?\\n|\\s{4,}|$))`;

    // -------------------------------------------------------------
    // Step 1 & 2: Exact & Normalized Alias + Same-Line Value (Key: Value)
    // -------------------------------------------------------------
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sameLineRegex = new RegExp(`(?:^|\\b)${escaped}(?:\\s*\\([^)]+\\))?\\s*[:=–-]\\s*([A-Za-z0-9\\$€£₹.,_\\- /#&]+?)${boundaryLookahead}`, 'im');
      const match = text.match(sameLineRegex);
      if (match && match[1] && match[1].trim()) {
        let candidate = match[1].trim().replace(/[;,]$/, '');
        if (dataType === 'decimal' || dataType === 'number' || dataType === 'integer' || dataType === 'currency' || dataType === 'float') {
          const numMatch = candidate.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/);
          if (numMatch) candidate = numMatch[0].replace(/,/g, '');
        }
        if (candidate.length > 0 && !candidate.toLowerCase().includes(alias.toLowerCase())) {
          return {
            value: candidate,
            confidence: 0.95,
            step: 'SAME_LINE_ALIAS',
            evidence: match[0].trim()
          };
        }
      }
    }

    // -------------------------------------------------------------
    // Step 3 & 4: Exact & Normalized Alias + Next-Line Value (Key\nValue)
    // -------------------------------------------------------------
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nextLineRegex = new RegExp(`(?:^|\\b)${escaped}(?:\\s*\\([^)]+\\))?\\s*[:=–-]?\\s*\\r?\\n\\s*([A-Za-z0-9\\$€£₹.,_\\- /#&]+?)${boundaryLookahead}`, 'i');
      const match = text.match(nextLineRegex);
      if (match && match[1] && match[1].trim()) {
        let candidate = match[1].trim().replace(/[;,]$/, '');
        if (dataType === 'decimal' || dataType === 'number' || dataType === 'integer' || dataType === 'currency' || dataType === 'float') {
          const numMatch = candidate.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/);
          if (numMatch) candidate = numMatch[0].replace(/,/g, '');
        }
        if (candidate.length > 0 && !candidate.toLowerCase().includes(alias.toLowerCase())) {
          return {
            value: candidate,
            confidence: 0.90,
            step: 'NEXT_LINE_ALIAS',
            evidence: match[0].trim()
          };
        }
      }
    }

    // -------------------------------------------------------------
    // Step 5: Configured Regex from Schema
    // -------------------------------------------------------------
    const configuredRegex = (fieldDef.extraction && fieldDef.extraction.regex) || fieldDef.regex || null;
    if (configuredRegex) {
      try {
        const reg = new RegExp(configuredRegex, 'i');
        const match = text.match(reg);
        if (match) {
          const candidate = (match[1] || match[0]).trim();
          return {
            value: candidate,
            confidence: 0.92,
            step: 'CONFIGURED_REGEX',
            evidence: match[0].trim()
          };
        }
      } catch (e) {}
    }

    // -------------------------------------------------------------
    // Step 6: Fuzzy / Substring Label Matching
    // -------------------------------------------------------------
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLower = line.toLowerCase();
        if (lineLower.includes(aliasLower)) {
          // Check if value is on same line after alias
          const parts = line.split(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
          if (parts.length > 1 && parts[1].replace(/[:=–-]/g, '').trim()) {
            const val = parts[1].replace(/^[\s:=–-]+/, '').trim();
            return {
              value: val,
              confidence: 0.82,
              step: 'FUZZY_SAME_LINE',
              evidence: line
            };
          }
          // Check if value is on immediate next line
          if (i + 1 < lines.length && lines[i + 1] && !lines[i + 1].includes(':')) {
            return {
              value: lines[i + 1],
              confidence: 0.80,
              step: 'FUZZY_NEXT_LINE',
              evidence: `${line} -> ${lines[i + 1]}`
            };
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Step 7: Safe Semantic Fallback based on Data Type & Key
    // -------------------------------------------------------------
    if (dataType === 'date' || key.includes('date')) {
      const dateMatch = text.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
      if (dateMatch) {
        return {
          value: dateMatch[1].trim(),
          confidence: 0.70,
          step: 'SEMANTIC_DATE_FALLBACK',
          evidence: dateMatch[0]
        };
      }
    } else if (dataType === 'decimal' || dataType === 'number' || key.includes('amount') || key.includes('total') || key.includes('value')) {
      const numMatch = text.match(/(?:INR|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/);
      if (numMatch) {
        return {
          value: numMatch[1].replace(/,/g, '').trim(),
          confidence: 0.70,
          step: 'SEMANTIC_NUMBER_FALLBACK',
          evidence: numMatch[0]
        };
      }
    }

    // Default value if configured
    if (fieldDef.defaultValue !== undefined && fieldDef.defaultValue !== null) {
      return {
        value: fieldDef.defaultValue,
        confidence: 0.50,
        step: 'DEFAULT_VALUE',
        evidence: 'Field default configuration'
      };
    }

    return { value: null, confidence: 0.0, step: 'UNMATCHED', evidence: null };
  }

  /**
   * Extract fields across multiple engine extraction outputs and calculate field-level consensus
   * @param {Array} fieldDefinitions - List of schema field definitions
   * @param {Array} engineExtractions - Array of { engineId, engineName, engineMode, rawText, confidence }
   */
  static extractAndConsensus(fieldDefinitions = [], engineExtractions = []) {
    // Filter to usable REAL engines (or MOCK only if no real engines provided)
    const realEngines = engineExtractions.filter(e => e.engineMode === 'REAL' && e.rawText && e.rawText.trim().length > 0);
    const usableEngines = realEngines.length > 0
      ? realEngines
      : engineExtractions.filter(e => e.rawText && e.rawText.trim().length > 0);

    // If no explicit field definitions provided, run Zero-Shot Dynamic Discovery
    if (fieldDefinitions.length === 0 && usableEngines.length > 0) {
      const allText = usableEngines.map(e => e.rawText).join('\n');
      return this.autoDiscoverFields(allText, usableEngines);
    }

    const structuredFields = [];

    for (const fieldDef of fieldDefinitions) {
      const key = fieldDef.fieldKey || fieldDef.key;
      const displayName = fieldDef.displayName || fieldDef.name || key;
      const dataType = fieldDef.dataType || fieldDef.type || 'string';

      const engineCandidates = {};
      const candidateClusters = new Map();

      for (const engine of usableEngines) {
        const extraction = this.extractFieldCandidate(fieldDef, engine.rawText);
        engineCandidates[engine.engineId || engine.engineName] = {
          value: extraction.value,
          confidence: extraction.confidence,
          step: extraction.step,
          evidence: extraction.evidence
        };

        if (extraction.value !== null && extraction.value !== undefined) {
          const normKey = this.normalizeForComparison(extraction.value, dataType);
          if (normKey) {
            if (!candidateClusters.has(normKey)) {
              candidateClusters.set(normKey, {
                representativeValue: extraction.value,
                normalizedKey: normKey,
                evidence: extraction.evidence,
                engines: [],
                totalConfidence: 0
              });
            }
            const cluster = candidateClusters.get(normKey);
            cluster.engines.push(engine.engineId || engine.engineName);
            cluster.totalConfidence += (extraction.confidence * (engine.confidence || 1.0));
          }
        }
      }

      // Determine winning field value based on cluster weight
      let bestCluster = null;
      for (const cluster of candidateClusters.values()) {
        if (!bestCluster) {
          bestCluster = cluster;
        } else if (cluster.engines.length > bestCluster.engines.length) {
          bestCluster = cluster;
        } else if (cluster.engines.length === bestCluster.engines.length && cluster.totalConfidence > bestCluster.totalConfidence) {
          bestCluster = cluster;
        }
      }

      let winningValue = null;
      let winningConfidence = 0.40;
      let source = 'NOT_DETECTED';
      let supportingEngines = [];
      let sourceText = null;

      if (bestCluster) {
        winningValue = bestCluster.representativeValue;
        supportingEngines = bestCluster.engines;
        source = supportingEngines.length > 1 ? 'CONSENSUS' : (supportingEngines[0] || 'EXTRACTION');
        sourceText = bestCluster.evidence;
        const consensusBonus = supportingEngines.length > 1 ? 0.05 : 0;
        winningConfidence = Math.min(0.99, Number(((bestCluster.totalConfidence / supportingEngines.length) + consensusBonus).toFixed(2)));
      } else if (fieldDef.defaultValue) {
        winningValue = fieldDef.defaultValue;
        source = 'DEFAULT_CONFIG';
        winningConfidence = 0.50;
      }

      structuredFields.push({
        fieldDefinitionId: fieldDef.fieldDefinitionId || fieldDef.fieldId || null,
        fieldKey: key,
        displayName,
        dataType,
        required: !!fieldDef.required,
        machineValue: winningValue,
        humanValue: null,
        effectiveValue: winningValue,
        confidence: winningConfidence,
        source,
        supportingEngines,
        candidateValues: engineCandidates,
        pageNumber: 1,
        sourceText: sourceText || (winningValue ? String(winningValue) : 'Not detected in document evidence')
      });
    }

    return structuredFields;
  }

  /**
   * Zero-Shot Dynamic Schema Discovery: automatically extracts all key-value pairs, dates, amounts, and identifiers
   */
  static autoDiscoverFields(text, engines = []) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];

    const discovered = [];
    const seenKeys = new Set();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 1. Discover explicit Key: Value pairs
    for (const line of lines) {
      const kvMatch = line.match(/^([A-Za-z0-9\s#_\-\.]{2,35})\s*[:=–-]\s*(.{1,120})$/);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim();
        const val = kvMatch[2].trim().replace(/[;,]$/, '');
        const slugKey = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

        if (slugKey.length >= 2 && val.length > 0 && !seenKeys.has(slugKey)) {
          seenKeys.add(slugKey);

          // Infer data type
          let dataType = 'string';
          if (/^(\$|€|£|₹|\¥)?\s?\d+([.,]\d{2})?$/.test(val)) dataType = 'number';
          else if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(val) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(val)) dataType = 'date';
          else if (/^(true|false|yes|no)$/i.test(val)) dataType = 'boolean';

          discovered.push({
            fieldDefinitionId: null,
            fieldKey: slugKey,
            displayName: rawKey.replace(/\b\w/g, c => c.toUpperCase()),
            dataType,
            required: false,
            machineValue: val,
            humanValue: null,
            effectiveValue: val,
            confidence: 0.90,
            source: engines.length > 0 ? (engines[0].engineName || 'CONSENSUS') : 'DYNAMIC_DISCOVERY',
            supportingEngines: engines.map(e => e.engineName || e.engineId),
            candidateValues: {},
            pageNumber: 1,
            sourceText: line
          });
        }
      }
    }

    // 2. Discover freestanding totals/amounts if not already captured
    if (!seenKeys.has('total_amount') && !seenKeys.has('total')) {
      const moneyMatch = text.match(/(?:Total|Grand Total|Amount Due|Balance|Final)\s*[:=–-]?\s*(\$|€|£|₹|\¥)?\s*(\d+[.,]\d{2})/i);
      if (moneyMatch) {
        discovered.push({
          fieldDefinitionId: null,
          fieldKey: 'total_amount',
          displayName: 'Total Amount',
          dataType: 'number',
          required: false,
          machineValue: moneyMatch[2],
          humanValue: null,
          effectiveValue: moneyMatch[2],
          confidence: 0.92,
          source: 'DYNAMIC_DISCOVERY',
          supportingEngines: engines.map(e => e.engineName || e.engineId),
          candidateValues: {},
          pageNumber: 1,
          sourceText: moneyMatch[0]
        });
      }
    }

    return discovered;
  }
}

module.exports = FieldExtractionService;
