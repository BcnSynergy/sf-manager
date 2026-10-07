export interface LoginRateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_SECONDS = 900;

// Unset or empty means "use the default"; anything else must be a positive
// integer, otherwise startup fails fast (same stance as getAuthConfig()).
function parsePositiveInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return Number(raw);
}

export function getLoginRateLimitConfig(): LoginRateLimitConfig {
  const maxAttempts = parsePositiveInteger(
    'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const windowSeconds = parsePositiveInteger(
    'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_WINDOW_SECONDS,
  );
  return { maxAttempts, windowMs: windowSeconds * 1000 };
}
