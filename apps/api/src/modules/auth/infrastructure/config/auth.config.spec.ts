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

  it('throws when CORS_ORIGIN is missing', () => {
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.CORS_ORIGIN;

    expect(() => getAuthConfig()).toThrow(/CORS_ORIGIN/);
  });

  it('returns dev cookie settings (secure:false, sameSite:lax) outside production', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_EXPIRES_IN;

    expect(getAuthConfig()).toEqual({
      jwtSecret: 'test-secret',
      jwtExpiresIn: '2h',
      corsOrigin: 'http://localhost:5173',
      cookie: {
        name: 'sf_access_token',
        httpOnly: true,
        path: '/',
        secure: false,
        sameSite: 'lax',
        maxAge: 2 * 60 * 60 * 1000,
      },
    });
  });

  it('returns production cookie settings (secure:true, sameSite:strict) when NODE_ENV is production', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.CORS_ORIGIN = 'https://app.sf-manager.example';
    process.env.NODE_ENV = 'production';

    const config = getAuthConfig();

    expect(config.cookie).toEqual({
      name: 'sf_access_token',
      httpOnly: true,
      path: '/',
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });
  });

  it('respects a custom JWT_EXPIRES_IN for both jwtExpiresIn and the cookie maxAge', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '30m';

    const config = getAuthConfig();

    expect(config.jwtExpiresIn).toBe('30m');
    expect(config.cookie.maxAge).toBe(30 * 60 * 1000);
  });

  it('throws for an unparseable JWT_EXPIRES_IN format', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = 'not-a-duration';

    expect(() => getAuthConfig()).toThrow(/JWT_EXPIRES_IN/);
  });

  it('exports a stable AUTH_CONFIG DI token', () => {
    expect(typeof AUTH_CONFIG).toBe('symbol');
  });
});
