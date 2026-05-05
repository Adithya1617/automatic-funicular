import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from '../../shared/utils/csv';

describe('csvEscape', () => {
  it('passes simple values through', () => {
    expect(csvEscape('rice')).toBe('rice');
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape(true)).toBe('true');
  });

  it('renders null/undefined as empty cells', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes values that contain commas, quotes, or newlines, and doubles inner quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    const out = toCsv([
      ['name', 'qty'],
      ['Rice', 25],
      ['Paneer, fresh', 5],
    ]);
    expect(out).toBe('name,qty\r\nRice,25\r\n"Paneer, fresh",5');
  });

  it('handles an empty input gracefully', () => {
    expect(toCsv([])).toBe('');
  });
});
