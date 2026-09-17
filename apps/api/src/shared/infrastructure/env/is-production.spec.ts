import { isProduction } from './is-production';

// nav-menu verify-report (second review round): auth.config.ts and
// should-seed-dev-account.ts each inlined the same
// `process.env.NODE_ENV === 'production'` check. This single predicate is
// the shared source of truth both call sites now use.
describe('isProduction', () => {
  it('returns true when nodeEnv is "production"', () => {
    expect(isProduction('production')).toBe(true);
  });

  it('returns false when nodeEnv is "development"', () => {
    expect(isProduction('development')).toBe(false);
  });

  it('returns false when nodeEnv is undefined', () => {
    expect(isProduction(undefined)).toBe(false);
  });

  it('returns false when nodeEnv is "test"', () => {
    expect(isProduction('test')).toBe(false);
  });
});
