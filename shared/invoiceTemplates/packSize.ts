export type PackSize = {
  size: number;
  unit: 'g' | 'ml' | 'each';
};

const RE = /,\s*(\d+(?:\.\d+)?)\s*(gm|kg|ml|l|pcs|pack|g)\b/i;

export function extractPackSize(description: string): PackSize | null {
  const m = RE.exec(description);
  if (!m) return null;
  const num = Number.parseFloat(m[1]!);
  if (!Number.isFinite(num) || num <= 0) return null;
  const raw = m[2]!.toLowerCase();
  switch (raw) {
    case 'gm':
    case 'g':
      return { size: num, unit: 'g' };
    case 'kg':
      return { size: num * 1000, unit: 'g' };
    case 'ml':
      return { size: num, unit: 'ml' };
    case 'l':
      return { size: num * 1000, unit: 'ml' };
    case 'pcs':
    case 'pack':
      return { size: num, unit: 'each' };
    default:
      return null;
  }
}
