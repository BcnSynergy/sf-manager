import { parsePositiveInteger } from './login-rate-limit.config';

// TD-5 S7: POST /auth/refresh has its own per-client-key limit. A refresh is
// routine (one per access-token lifetime per browser), so the default is
// far above login's, and offices behind one IP still fit. Read once at boot
// through REFRESH_RATE_LIMIT_CONFIG, so an invalid value stops startup.
export interface RefreshRateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

export const REFRESH_RATE_LIMIT_CONFIG = Symbol('REFRESH_RATE_LIMIT_CONFIG');

const DEFAULT_REFRESH_MAX_ATTEMPTS = 60;
const DEFAULT_REFRESH_WINDOW_SECONDS = 60;

export function getRefreshRateLimitConfig(): RefreshRateLimitConfig {
  const maxAttempts = parsePositiveInteger(
    'REFRESH_RATE_LIMIT_MAX_ATTEMPTS',
    process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS,
    DEFAULT_REFRESH_MAX_ATTEMPTS,
  );
  const windowSeconds = parsePositiveInteger(
    'REFRESH_RATE_LIMIT_WINDOW_SECONDS',
    process.env.REFRESH_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_REFRESH_WINDOW_SECONDS,
  );
  return { maxAttempts, windowMs: windowSeconds * 1000 };
}
