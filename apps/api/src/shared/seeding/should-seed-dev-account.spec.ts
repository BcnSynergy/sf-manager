import { shouldSeedDevAccount } from './should-seed-dev-account';

// nav-menu verify-report WARNING-3: apps/api/prisma/seed.ts created a
// hardcoded, publicly-visible technician account
// (technician@sf-manager.example / nav-menu-verify-12345) with no guard,
// unlike the admin account in the same file, which is env-driven. This pure
// predicate is the guard: mirrors auth.config.ts's own
// `process.env.NODE_ENV === 'production'` check (apps/api/src/modules/auth/
// infrastructure/config/auth.config.ts) so the hardcoded dev-only account is
// never created in production.
describe('shouldSeedDevAccount', () => {
  it('returns false when NODE_ENV is production', () => {
    expect(shouldSeedDevAccount('production')).toBe(false);
  });

  it('returns true when NODE_ENV is development', () => {
    expect(shouldSeedDevAccount('development')).toBe(true);
  });

  it('returns true when NODE_ENV is undefined (local scripts with no env set)', () => {
    expect(shouldSeedDevAccount(undefined)).toBe(true);
  });

  it('returns true when NODE_ENV is test', () => {
    expect(shouldSeedDevAccount('test')).toBe(true);
  });
});
