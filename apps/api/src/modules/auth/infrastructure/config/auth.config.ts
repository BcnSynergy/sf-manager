export const ACCESS_TOKEN_COOKIE_NAME = 'sf_access_token';
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  cookie: {
    name: string;
    httpOnly: true;
    path: '/';
    secure: boolean;
    sameSite: 'lax' | 'strict';
    maxAge: number; // milliseconds, derived from jwtExpiresIn
  };
}

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) {
    throw new Error(
      `Invalid JWT_EXPIRES_IN format: "${value}" (expected e.g. "2h", "30m")`,
    );
  }
  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNIT_MS[unit];
}

// design.md: typed factory reading plain process.env (no @nestjs/config —
// consistent with main.ts's existing dotenv/config import). Throws at
// call-time if JWT_SECRET or CORS_ORIGIN is missing — an unset CORS_ORIGIN
// must fail fast rather than silently falling through to the `cors`
// package's default "allow any origin" behavior for a missing `origin`
// option, which would recreate the wildcard-plus-credentials
// misconfiguration Architecture Decision 5 exists to prevent.
//
// Only actually invoked when AuthModule is instantiated by Nest's DI
// container — this PR wires the call site (auth.module.ts's
// JwtModule.registerAsync() and the AUTH_CONFIG provider), but AuthModule
// itself is not imported into AppModule until PR 4 (app.module.ts/main.ts
// wiring), and no PR 3 test builds AuthModule through Nest's container.
export function getAuthConfig(): AuthConfig {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    throw new Error('CORS_ORIGIN environment variable is required');
  }

  const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '2h';
  const maxAge = parseDurationMs(jwtExpiresIn);
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    jwtSecret,
    jwtExpiresIn,
    corsOrigin,
    cookie: {
      name: ACCESS_TOKEN_COOKIE_NAME,
      httpOnly: true,
      path: '/',
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
    },
  };
}
