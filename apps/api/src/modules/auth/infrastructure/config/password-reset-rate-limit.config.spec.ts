import { getPasswordResetRateLimitConfig } from './password-reset-rate-limit.config';

// password-reset S6: both public endpoints are limited per client key; the
// request endpoint also per normalized email. The limits are read at boot.
describe('getPasswordResetRateLimitConfig', () => {
  const originalEnv = process.env;
  const VARIABLES = [
    'PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS',
    'PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS',
    'PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS',
    'PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
  ];

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const variable of VARIABLES) {
      delete process.env[variable];
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to 10 attempts per client key in 15 minutes and 3 requests per email in an hour', () => {
    expect(getPasswordResetRateLimitConfig()).toEqual({
      maxAttempts: 10,
      windowMs: 900_000,
      emailMaxRequests: 3,
      emailWindowMs: 3_600_000,
    });
  });

  it('parses explicit values', () => {
    process.env.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS = '5';
    process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = '30';
    process.env.PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS = '2';
    process.env.PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS = '60';

    expect(getPasswordResetRateLimitConfig()).toEqual({
      maxAttempts: 5,
      windowMs: 30_000,
      emailMaxRequests: 2,
      emailWindowMs: 60_000,
    });
  });

  it.each(VARIABLES)(
    'throws naming %s for a value that is not a positive integer',
    (variable) => {
      process.env[variable] = '0';

      expect(() => getPasswordResetRateLimitConfig()).toThrow(
        new RegExp(variable),
      );
    },
  );

  it.each([
    'PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS',
    'PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
  ])('accepts 86400 and rejects 86401 for %s', (variable) => {
    process.env[variable] = '86400';
    expect(() => getPasswordResetRateLimitConfig()).not.toThrow();

    process.env[variable] = '86401';
    expect(() => getPasswordResetRateLimitConfig()).toThrow(
      new RegExp(variable),
    );
  });

  it.each(VARIABLES)('throws naming %s for a non-numeric value', (variable) => {
    process.env[variable] = 'abc';

    expect(() => getPasswordResetRateLimitConfig()).toThrow(
      new RegExp(variable),
    );
  });
});
