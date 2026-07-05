/** Formats a number as EUR, e.g. 1300 → "€1,300.00" (en-GB locale, as app-wide). */
export function eur(value: number): string {
  return value.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}
