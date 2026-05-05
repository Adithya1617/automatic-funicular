export type RankableIngredient = {
  id: string;
  name: string;
  isActive: boolean;
};

const TOKEN_MIN_LEN = 3;
const OVERLAP_THRESHOLD = 0.5;
const MAX_RESULTS = 3;

function tokenise(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\w]/g, ''))
      .filter((t) => t.length >= TOKEN_MIN_LEN),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect / union;
}

export function rankIngredientMatches<T extends RankableIngredient>(
  query: string,
  ingredients: readonly T[],
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const qTokens = tokenise(q);

  const scored: Array<{ ing: T; score: number }> = [];
  for (const ing of ingredients) {
    if (!ing.isActive) continue;
    const name = ing.name.toLowerCase();

    let score = 0;
    if (name === q) {
      score = 1.0;
    } else if (name.includes(q) || q.includes(name)) {
      // Substring containment → strong signal but below exact match.
      score = 0.85;
    } else {
      const overlap = tokenOverlap(qTokens, tokenise(name));
      if (overlap >= OVERLAP_THRESHOLD) score = overlap;
    }
    if (score > 0) scored.push({ ing, score });
  }

  scored.sort((a, b) => b.score - a.score || a.ing.name.localeCompare(b.ing.name));
  return scored.slice(0, MAX_RESULTS).map((s) => s.ing);
}
