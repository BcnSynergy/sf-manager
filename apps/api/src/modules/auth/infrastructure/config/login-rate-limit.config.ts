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

// Per-email failure limit (login-account-lockout/design.md Decision 8). Counts
// failed credential checks for one normalized email across every client key,
// so it has its own variables and defaults, independent of the per-client-key
// limit above.
export interface LoginEmailRateLimitConfig {
  maxFailures: number;
  windowMs: number;
}

const DEFAULT_EMAIL_MAX_FAILURES = 5;
const DEFAULT_EMAIL_WINDOW_SECONDS = 900;

// Upper bounds. The limit is cast with ::int in the adapter's SQL, so it
// cannot exceed the int4 maximum without failing at runtime instead of at boot.
// The window is capped at 24 hours: a block lasts as long as the window and
// any third party who knows an email can trigger it, so the cap bounds the
// account-lockout denial of service a misconfiguration could cause (it also
// keeps the timestamptz arithmetic in range).
const MAX_EMAIL_MAX_FAILURES = 2147483647;
const MAX_EMAIL_WINDOW_SECONDS = 86400;

export function getLoginEmailRateLimitConfig(): LoginEmailRateLimitConfig {
  const maxFailures = parsePositiveInteger(
    'LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES',
    process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES,
    DEFAULT_EMAIL_MAX_FAILURES,
    MAX_EMAIL_MAX_FAILURES,
  );
  const windowSeconds = parsePositiveInteger(
    'LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
    process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_EMAIL_WINDOW_SECONDS,
    MAX_EMAIL_WINDOW_SECONDS,
  );
  return { maxFailures, windowMs: windowSeconds * 1000 };
}
