/**
 * Minimal RFC-4180 CSV parser. Handles:
 *   - quoted cells (containing commas, quotes, line breaks)
 *   - escaped quotes (`""` → `"`)
 *   - CRLF or LF line endings
 *   - leading BOM
 *   - trailing newline / blank trailing rows
 * Each row's `lineNumber` reflects the 1-based source-line index where the
 * row *started* (multi-line quoted cells count from their opening line).
 */

export type ParsedRow = {
  /** 1-based source line number where this row started. */
  lineNumber: number;
  cells: string[];
};

export function parseCsv(input: string): ParsedRow[] {
  // Strip UTF-8 BOM.
  let src = input;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const rows: ParsedRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let pendingRow = false;

  function endCell() {
    cells.push(cell);
    cell = '';
  }
  function endRow() {
    cells.push(cell);
    if (cells.length === 1 && cells[0] === '') {
      // Skip purely blank lines.
    } else {
      rows.push({ lineNumber: rowStartLine, cells });
    }
    cells = [];
    cell = '';
    pendingRow = false;
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!pendingRow) {
      rowStartLine = line;
      pendingRow = true;
    }
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      endCell();
      continue;
    }
    if (ch === '\r') {
      // Treat \r\n as one line break; bare \r as one too.
      if (src[i + 1] === '\n') i++;
      endRow();
      line++;
      continue;
    }
    if (ch === '\n') {
      endRow();
      line++;
      continue;
    }
    cell += ch;
  }
  // Final cell / row if no trailing newline.
  if (pendingRow || cell.length > 0) {
    endRow();
  }
  return rows;
}

/**
 * Convenience: parse and return as `{ headers, rows }` where each row is
 * `{ lineNumber, values: Record<string, string> }`. Header keys are
 * lowercased + trimmed for case-insensitive lookup. Empty header columns
 * are kept as `''`.
 */
export type CsvTable = {
  headers: string[];
  rows: Array<{ lineNumber: number; values: Record<string, string> }>;
};

export function parseCsvTable(input: string): CsvTable {
  const parsed = parseCsv(input);
  if (parsed.length === 0) return { headers: [], rows: [] };
  const headers = parsed[0]!.cells.map((h) => h.trim().toLowerCase());
  const rows = parsed.slice(1).map((r) => {
    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      values[h] = (r.cells[idx] ?? '').trim();
    });
    return { lineNumber: r.lineNumber, values };
  });
  return { headers, rows };
}
