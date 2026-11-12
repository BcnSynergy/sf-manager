import { AUTH_CONFIG, getAuthConfig } from './auth.config';

// Unit test only — mocks process.env, does not require real env vars to
// exist (design.md: getAuthConfig() is only actually invoked when
// AuthModule is wired into the running app in PR 4).
describe('getAuthConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    expect(() => getAuthConfig()).toThrow(/JWT_SECRET/);
  });

  // EN-180: JWT_SECRET follows the shared strength rules (readSecret).
  // The whole message is matched, so it provably never carries the value.
  it.each([
    [
      'shorter than 32 characters',
      'a'.repeat(31),
      'JWT_SECRET must be at least 32 characters long, got 31',
    ],
    [
      'padded with whitespace',
      ` ${'a'.repeat(32)}`,
      'JWT_SECRET must not start or end with whitespace',
    ],
  ])('throws when JWT_SECRET is %s', (_case, value, message) => {
    process.env.JWT_SECRET = value;
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    expect(() => getAuthConfig()).toThrow(new Error(message));
  });

  it('throws when CORS_ORIGIN is missing', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    delete process.env.CORS_ORIGIN;

    expect(() => getAuthConfig()).toThrow(/CORS_ORIGIN/);
  });

  // EN-140: browsers send `Origin` as scheme://host[:port] with no path, and
  // SameOriginGuard and enableCors compare it exactly, so anything else
  // would refuse every refresh and logout with 403.
  it.each([
    ['a trailing slash', 'http://localhost:5173/', 'http://localhost:5173'],
    ['a path', 'https://app.example/web', 'https://app.example'],
    ['upper-case letters', 'HTTP://Localhost:5173', 'http://localhost:5173'],
    // EN-143: browsers omit a default port from `Origin`, so it is dropped.
    [
      'the default https port',
      'https://app.example:443',
      'https://app.example',
    ],
    ['the default http port', 'http://app.example:80', 'http://app.example'],
  ])(
    'throws when CORS_ORIGIN has %s, naming the expected value',
    (_case, value, expected) => {
      process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
      process.env.CORS_ORIGIN = value;

      expect(() => getAuthConfig()).toThrow(
        `CORS_ORIGIN must be an origin (scheme://host[:port]), got "${value}"; did you mean "${expected}"?`,
      );
    },
  );

  // No origin can be derived, so the message has no "did you mean" part. An
  // Error argument makes toThrow compare the whole message, not a substring.
  it.each([
    ['is not a URL', 'not a url'],
    // EN-143: a URL with an opaque origin, which serializes as "null".
    ['has an opaque origin', 'file:///x'],
  ])('throws without a suggestion when CORS_ORIGIN %s', (_case, value) => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = value;

    expect(() => getAuthConfig()).toThrow(
      new Error(
        `CORS_ORIGIN must be an origin (scheme://host[:port]), got "${value}"`,
      ),
    );
  });

  it('accepts an origin with a port unchanged', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    expect(getAuthConfig().corsOrigin).toBe('http://localhost:5173');
  });

  it('returns dev cookie settings (secure:false, sameSite:lax) outside production', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.REFRESH_TOKEN_IDLE_TTL;
    delete process.env.REFRESH_TOKEN_ABSOLUTE_TTL;
    delete process.env.REFRESH_TOKEN_REUSE_GRACE;
    delete process.env.REFRESH_TOKEN_COOKIE_PATH;

    expect(getAuthConfig()).toEqual({
      jwtSecret: 'test-jwt-secret-0123456789abcdefghij',
      // TD-5 S1: ADR-011 Decision 4's ~15 min, now that the web refreshes.
      jwtExpiresIn: '15m',
      corsOrigin: 'http://localhost:5173',
      cookie: {
        name: 'sf_access_token',
        httpOnly: true,
        path: '/',
        secure: false,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      },
      // TD-5 S5 ("8 h inactiv. / 7 d máx.") and the S4 grace window.
      refreshToken: {
        idleTtlMs: 8 * 60 * 60 * 1000,
        absoluteTtlMs: 7 * 24 * 60 * 60 * 1000,
        reuseGraceMs: 10 * 1000,
      },
      // TD-5 S2: scoped to the auth routes (login, refresh, logout), not
      // sent with every API call.
      refreshCookie: {
        name: 'sf_refresh_token',
        httpOnly: true,
        path: '/auth',
        secure: false,
        sameSite: 'lax',
      },
    });
  });

  it('returns production cookie settings (secure:true, sameSite:strict) when NODE_ENV is production', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'https://app.sf-manager.example';
    process.env.NODE_ENV = 'production';

    const config = getAuthConfig();

    expect(config.cookie).toEqual({
      name: 'sf_access_token',
      httpOnly: true,
      path: '/',
      secure: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
  });

  it('respects a custom JWT_EXPIRES_IN for both jwtExpiresIn and the cookie maxAge', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '30m';

    const config = getAuthConfig();

    expect(config.jwtExpiresIn).toBe('30m');
    expect(config.cookie.maxAge).toBe(30 * 60 * 1000);
  });

  it('throws for an unparseable JWT_EXPIRES_IN format', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = 'not-a-duration';

    expect(() => getAuthConfig()).toThrow(/JWT_EXPIRES_IN/);
  });

  it('reads the refresh-token lifetimes and grace window from the environment', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.REFRESH_TOKEN_IDLE_TTL = '30m';
    process.env.REFRESH_TOKEN_ABSOLUTE_TTL = '1d';
    process.env.REFRESH_TOKEN_REUSE_GRACE = '5s';

    expect(getAuthConfig().refreshToken).toEqual({
      idleTtlMs: 30 * 60 * 1000,
      absoluteTtlMs: 24 * 60 * 60 * 1000,
      reuseGraceMs: 5 * 1000,
    });
  });

  it.each([
    'REFRESH_TOKEN_IDLE_TTL',
    'REFRESH_TOKEN_ABSOLUTE_TTL',
    'REFRESH_TOKEN_REUSE_GRACE',
  ])('throws naming %s when its format is unparseable', (variable) => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env[variable] = '8 hours';

    expect(() => getAuthConfig()).toThrow(new RegExp(variable));
  });

  it('accepts a zero reuse grace: strict rotation, no grace exchange', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.REFRESH_TOKEN_REUSE_GRACE = '0s';

    expect(getAuthConfig().refreshToken.reuseGraceMs).toBe(0);
  });

  it.each(['REFRESH_TOKEN_IDLE_TTL', 'REFRESH_TOKEN_ABSOLUTE_TTL'])(
    'throws naming %s when it is zero',
    (variable) => {
      process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
      process.env.CORS_ORIGIN = 'http://localhost:5173';
      process.env[variable] = '0h';

      expect(() => getAuthConfig()).toThrow(
        new RegExp(`${variable}.*greater than zero`),
      );
    },
  );

  it('gives the refresh cookie the production flags of the access cookie', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'https://app.sf-manager.example';
    process.env.NODE_ENV = 'production';

    expect(getAuthConfig().refreshCookie).toMatchObject({
      secure: true,
      sameSite: 'strict',
    });
  });

  it('reads the refresh cookie path from REFRESH_TOKEN_COOKIE_PATH (the browser sees /api/auth behind Caddy)', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.REFRESH_TOKEN_COOKIE_PATH = '/api/auth';

    expect(getAuthConfig().refreshCookie.path).toBe('/api/auth');
  });

  it.each(['auth', 'api/auth', ''])(
    'throws naming REFRESH_TOKEN_COOKIE_PATH when it does not start with a slash ("%s")',
    (value) => {
      process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdefghij';
      process.env.CORS_ORIGIN = 'http://localhost:5173';
      process.env.REFRESH_TOKEN_COOKIE_PATH = value;

      expect(() => getAuthConfig()).toThrow(/REFRESH_TOKEN_COOKIE_PATH/);
    },
  );

  it('exports a stable AUTH_CONFIG DI token', () => {
    expect(typeof AUTH_CONFIG).toBe('symbol');
  });
});
