export function formatBikeTypeLabel(t: { engineCc: number; name: string }): string {
  return `${t.engineCc}cc ${t.name}`;
}
