// Unset or empty means "use the default"; anything else must be a positive
// integer, otherwise startup fails fast (same stance as getAuthConfig()).
export function parsePositiveInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  if (Number(raw) > max) {
    throw new Error(`${name} must be at most ${max}, got "${raw}"`);
  }
  return Number(raw);
}
