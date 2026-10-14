import {
  getLoginEmailRateLimitConfig,
  getLoginRateLimitConfig,
} from './login-rate-limit.config';

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

describe('getLoginEmailRateLimitConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES;
    delete process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to 5 failures per 15 minutes when both vars are unset', () => {
    expect(getLoginEmailRateLimitConfig()).toEqual({
      maxFailures: 5,
      windowMs: 900000,
    });
  });

  it('treats empty values as unset', () => {
    process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = '';
    process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS = '';

    expect(getLoginEmailRateLimitConfig()).toEqual({
      maxFailures: 5,
      windowMs: 900000,
    });
  });

  it('parses explicit values and converts the window to milliseconds', () => {
    process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = '3';
    process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS = '60';

    expect(getLoginEmailRateLimitConfig()).toEqual({
      maxFailures: 3,
      windowMs: 60000,
    });
  });

  it('is independent of the per-client-key variables', () => {
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '99';
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = '99';

    expect(getLoginEmailRateLimitConfig()).toEqual({
      maxFailures: 5,
      windowMs: 900000,
    });
  });

  it.each(['0', '-1', '1.5', 'abc', ' 2'])(
    'throws naming LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES and the value for "%s"',
    (value) => {
      process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = value;

      expect(() => getLoginEmailRateLimitConfig()).toThrow(
        `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES must be a positive integer, got "${value}"`,
      );
    },
  );

  it.each(['0', '-1', '1.5', 'abc', ' 2'])(
    'throws naming LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS and the value for "%s"',
    (value) => {
      process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS = value;

      expect(() => getLoginEmailRateLimitConfig()).toThrow(
        `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS must be a positive integer, got "${value}"`,
      );
    },
  );
});
