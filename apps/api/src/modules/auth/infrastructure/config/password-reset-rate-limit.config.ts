import { parsePositiveInteger } from '../../../../shared/infrastructure/env/positive-integer';

// password-reset S6: both public endpoints (request and confirm) read the same
// per-client-key values, but each handler counts on its own (the throttler
// key includes the handler). There is no per-email limit (EN-200): anyone who
// knew a user's email could spend it from rotating addresses and keep that
// user from ever getting a link. The old PASSWORD_RESET_EMAIL_RATE_LIMIT_*
// variables are no longer read, so a leftover value cannot stop startup.
// The client-key limit leaves room for an office behind one IP. Read once at
// boot through PASSWORD_RESET_RATE_LIMIT_CONFIG, so an invalid value stops
// startup.
export interface PasswordResetRateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

export const PASSWORD_RESET_RATE_LIMIT_CONFIG = Symbol(
  'PASSWORD_RESET_RATE_LIMIT_CONFIG',
);

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_SECONDS = 900;

// Same bound as the login email limit: a block lasts as long as the window.
const MAX_WINDOW_SECONDS = 86400;

export function getPasswordResetRateLimitConfig(): PasswordResetRateLimitConfig {
  const maxAttempts = parsePositiveInteger(
    'PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS',
    process.env.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const windowSeconds = parsePositiveInteger(
    'PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS',
    process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_WINDOW_SECONDS,
    MAX_WINDOW_SECONDS,
  );
  return { maxAttempts, windowMs: windowSeconds * 1000 };
}
