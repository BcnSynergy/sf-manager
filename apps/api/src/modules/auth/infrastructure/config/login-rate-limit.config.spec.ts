import {
  getLoginEmailRateLimitConfig,
  getLoginRateLimitConfig,
  getRefreshRateLimitConfig,
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

  // parsePositiveInteger caps every variable at Number.MAX_SAFE_INTEGER by
  // default, so values that would silently lose precision are rejected.
  it.each(['9007199254740992', '99999999999999999999'])(
    'throws naming LOGIN_RATE_LIMIT_MAX_ATTEMPTS when above the safe integer range for "%s"',
    (value) => {
      process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = value;

      expect(() => getLoginRateLimitConfig()).toThrow(
        `LOGIN_RATE_LIMIT_MAX_ATTEMPTS must be at most 9007199254740991, got "${value}"`,
      );
    },
  );

  it.each(['9007199254740992', '99999999999999999999'])(
    'throws naming LOGIN_RATE_LIMIT_WINDOW_SECONDS when above the safe integer range for "%s"',
    (value) => {
      process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = value;

      expect(() => getLoginRateLimitConfig()).toThrow(
        `LOGIN_RATE_LIMIT_WINDOW_SECONDS must be at most 9007199254740991, got "${value}"`,
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

  it('accepts the int4 maximum for LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES', () => {
    process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = '2147483647';

    expect(getLoginEmailRateLimitConfig().maxFailures).toBe(2147483647);
  });

  // The adapter casts the limit with ::int, so a larger value would pass boot
  // and then fail every recordFailure with "integer out of range".
  it.each(['2147483648', '99999999999999999999'])(
    'throws naming LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES when above the int4 maximum for "%s"',
    (value) => {
      process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = value;

      expect(() => getLoginEmailRateLimitConfig()).toThrow(
        `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES must be at most 2147483647, got "${value}"`,
      );
    },
  );

  it('accepts a window of 24 hours for LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS', () => {
    process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS = '86400';

    expect(getLoginEmailRateLimitConfig().windowMs).toBe(86400000);
  });

  // The adapter adds the window to now() as a timestamptz; an absurd window
  // overflows the timestamp range and would fail every recordFailure.
  it.each(['86401', '99999999999999999999'])(
    'throws naming LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS when above 24 hours for "%s"',
    (value) => {
      process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS = value;

      expect(() => getLoginEmailRateLimitConfig()).toThrow(
        `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS must be at most 86400, got "${value}"`,
      );
    },
  );
});

// TD-5 S7: the refresh endpoint has its own per-client-key limit, apart
// from login: a refresh is routine, so its default is far higher.
describe('getRefreshRateLimitConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS;
    delete process.env.REFRESH_RATE_LIMIT_WINDOW_SECONDS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to 60 refreshes per minute', () => {
    expect(getRefreshRateLimitConfig()).toEqual({
      maxAttempts: 60,
      windowMs: 60000,
    });
  });

  it('parses explicit values', () => {
    process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = '5';
    process.env.REFRESH_RATE_LIMIT_WINDOW_SECONDS = '30';

    expect(getRefreshRateLimitConfig()).toEqual({
      maxAttempts: 5,
      windowMs: 30000,
    });
  });

  it.each([
    'REFRESH_RATE_LIMIT_MAX_ATTEMPTS',
    'REFRESH_RATE_LIMIT_WINDOW_SECONDS',
  ])(
    'throws naming %s for a value that is not a positive integer',
    (variable) => {
      process.env[variable] = '0';

      expect(() => getRefreshRateLimitConfig()).toThrow(new RegExp(variable));
    },
  );
});
