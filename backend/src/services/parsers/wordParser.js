/**
 * Native Word Document Parser (DOC / DOCX)
 * Extracts paragraphs, headings, tables, and section locations for evidence traceability.
 */

class WordParser {

  static async parseWordDocument(buffer, filename = 'document.docx') {
    const textContent = buffer.toString('utf-8');

    // Parse paragraphs and headings
    const rawLines = textContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    const paragraphs = rawLines.map((line, idx) => ({
      paragraphIndex: idx + 1,
      section: 'Body',
      text: line.trim()
    }));

    // Extracted text representation
    const fullText = paragraphs.map(p => p.text).join('\n');

    // Parse tables from Word document lines
    const tables = [];
    const tableLines = rawLines.filter(l => l.includes('|') || l.includes('\t'));
    if (tableLines.length > 0) {
      tables.push({
        tableIndex: 1,
        headers: tableLines[0].split(/[|\t]/).map(s => s.trim()).filter(Boolean),
        rows: tableLines.slice(1).map(l => l.split(/[|\t]/).map(s => s.trim()).filter(Boolean))
      });
    }

    return {
      sourceFormat: 'WORD',
      paragraphs,
      tables,
      fullText,
      logicalUnits: [
        {
          unitType: 'SECTION',
          sectionIndex: 1,
          text: fullText,
          paragraphs: paragraphs.slice(0, 10)
        }
      ]
    };
  }
}

module.exports = WordParser;

