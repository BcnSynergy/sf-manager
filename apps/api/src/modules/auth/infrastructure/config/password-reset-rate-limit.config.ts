import { parsePositiveInteger } from '../../../../shared/infrastructure/env/positive-integer';

// password-reset S6: both public endpoints (request and confirm) read the same
// per-client-key values, but each handler counts on its own (the throttler
// key includes the handler). The request endpoint adds a per-email limit that
// counts every request, whether or not the email has an account, so a 429
// reveals nothing about accounts. A reset is rare (the email limit is much
// stricter than login's), while the client-key limit leaves room for an
// office behind one IP. Read once at boot through
// PASSWORD_RESET_RATE_LIMIT_CONFIG, so an invalid value stops startup.
export interface PasswordResetRateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  emailMaxRequests: number;
  emailWindowMs: number;
}

export const PASSWORD_RESET_RATE_LIMIT_CONFIG = Symbol(
  'PASSWORD_RESET_RATE_LIMIT_CONFIG',
);

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_SECONDS = 900;
const DEFAULT_EMAIL_MAX_REQUESTS = 3;
const DEFAULT_EMAIL_WINDOW_SECONDS = 3600;

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
  const emailMaxRequests = parsePositiveInteger(
    'PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS',
    process.env.PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_EMAIL_MAX_REQUESTS,
  );
  const emailWindowSeconds = parsePositiveInteger(
    'PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
    process.env.PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_EMAIL_WINDOW_SECONDS,
    MAX_WINDOW_SECONDS,
  );
  return {
    maxAttempts,
    windowMs: windowSeconds * 1000,
    emailMaxRequests,
    emailWindowMs: emailWindowSeconds * 1000,
  };
}
