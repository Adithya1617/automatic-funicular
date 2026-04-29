const dmyFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDateDMY(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return dmyFormatter.format(date);
}
