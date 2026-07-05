/** Format a Date as YYYY-MM-DD in LOCAL time (never toISOString, which is UTC
 * and off by one day near midnight for non-UTC users). */
export function toIsoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}
