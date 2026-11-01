import { getRefreshRateLimitConfig } from './refresh-rate-limit.config';

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
