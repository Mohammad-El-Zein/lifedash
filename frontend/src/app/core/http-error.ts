/** Extract a readable message from a FastAPI error response. Handles both
 * string `detail` (HTTPException) and array `detail` (Pydantic 422 validation
 * errors) — interpolating the raw array would render "[object Object]". */
export function extractError(err: unknown, fallback: string): string {
  const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d?.msg === 'string' ? d.msg : String(d)))
      .join('; ');
  }
  return fallback;
}
