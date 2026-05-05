import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvTable } from '../../shared/utils/csvParser';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    const rows = parseCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([
      { lineNumber: 1, cells: ['a', 'b', 'c'] },
      { lineNumber: 2, cells: ['1', '2', '3'] },
    ]);
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(rows.map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('strips a leading BOM', () => {
    const rows = parseCsv('﻿a,b\n1,2');
    expect(rows[0]!.cells).toEqual(['a', 'b']);
  });

  it('keeps quoted cells with commas, escaped quotes, and embedded newlines together', () => {
    const csv = 'name,note\n"Paneer, fresh","line1\nline2"\n"says ""hi""",ok';
    const rows = parseCsv(csv);
    expect(rows[1]!.cells).toEqual(['Paneer, fresh', 'line1\nline2']);
    expect(rows[2]!.cells).toEqual(['says "hi"', 'ok']);
  });

  it('records lineNumber for the row start, not the embedded newline', () => {
    const csv = 'h\n"a\nb"\nfoo';
    const rows = parseCsv(csv);
    expect(rows[1]!.lineNumber).toBe(2);
    expect(rows[2]!.lineNumber).toBe(4);
  });

  it('skips blank trailing line', () => {
    const rows = parseCsv('a,b\n1,2\n');
    expect(rows).toHaveLength(2);
  });
});

describe('parseCsvTable', () => {
  it('lowercases header keys and zips them into row objects', () => {
    const t = parseCsvTable('Name,BaseUnit\nRice,g\nSalt,g');
    expect(t.headers).toEqual(['name', 'baseunit']);
    expect(t.rows[0]!.values).toEqual({ name: 'Rice', baseunit: 'g' });
  });

  it('returns empty headers/rows on empty input', () => {
    expect(parseCsvTable('')).toEqual({ headers: [], rows: [] });
  });

  it('fills missing columns with empty strings', () => {
    const t = parseCsvTable('a,b,c\n1,2');
    expect(t.rows[0]!.values).toEqual({ a: '1', b: '2', c: '' });
  });
});
