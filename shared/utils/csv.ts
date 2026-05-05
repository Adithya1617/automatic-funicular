/**
 * Minimal CSV writer. RFC 4180-flavoured: cells containing commas, quotes, or
 * line breaks are wrapped in double-quotes, with embedded quotes doubled. We
 * do this in shared/ so both main (export) and a future renderer-side import
 * can use the same encoding rules.
 */

export type CsvCell = string | number | boolean | null | undefined;

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}
