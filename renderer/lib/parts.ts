type PartLike = { name: string; category: string };
type LineLike = { ingredientId: string };

/**
 * The oil lines of a service event. A service is an oil change, so its display
 * (parts list + cost) should ignore any non-oil lines that legacy ad-hoc events
 * may carry. Prefers lines whose part is named "engine oil"; if none match,
 * falls back to any Oil-category line.
 */
export function serviceOilLines<T extends LineLike>(
  lines: T[],
  partById: Map<string, PartLike>,
): T[] {
  const named = lines.filter((l) =>
    partById.get(l.ingredientId)?.name.trim().toLowerCase().includes('engine oil'),
  );
  if (named.length > 0) return named;
  return lines.filter((l) => partById.get(l.ingredientId)?.category === 'Oil');
}
