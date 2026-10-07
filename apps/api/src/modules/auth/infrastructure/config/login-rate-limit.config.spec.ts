import { getLoginRateLimitConfig } from './login-rate-limit.config';

describe('getLoginRateLimitConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
    delete process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to 10 attempts per 15 minutes when both vars are unset', () => {
    expect(getLoginRateLimitConfig()).toEqual({
      maxAttempts: 10,
      windowMs: 900000,
    });
  });

  it('treats empty values as unset', () => {
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '';
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = '';

    expect(getLoginRateLimitConfig()).toEqual({
      maxAttempts: 10,
      windowMs: 900000,
    });
  });

  it('parses explicit values and converts the window to milliseconds', () => {
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '3';
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = '60';

    expect(getLoginRateLimitConfig()).toEqual({
      maxAttempts: 3,
      windowMs: 60000,
    });
  });

  it.each(['0', '-1', 'abc', '1.5'])(
    'throws naming LOGIN_RATE_LIMIT_MAX_ATTEMPTS for %s',
    (value) => {
      process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = value;

      expect(() => getLoginRateLimitConfig()).toThrow(
        /LOGIN_RATE_LIMIT_MAX_ATTEMPTS/,
      );
    },
  );

  it.each(['0', '-1', 'abc', '1.5'])(
    'throws naming LOGIN_RATE_LIMIT_WINDOW_SECONDS for %s',
    (value) => {
      process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = value;

      expect(() => getLoginRateLimitConfig()).toThrow(
        /LOGIN_RATE_LIMIT_WINDOW_SECONDS/,
      );
    },
  );
});
