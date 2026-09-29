import { shouldSeedDevData } from './should-seed-dev-data';

// dev-seed-data design.md Decision 3: the dev users and the dev dataset use
// hardcoded, publicly visible credentials, so they are seeded only on an
// exact `NODE_ENV === 'development'` match (an allow-list). Anything else,
// including unset, fails closed. No case or whitespace normalization: an
// allow-list must be exact.
describe('shouldSeedDevData', () => {
  it('returns true only when NODE_ENV is exactly "development"', () => {
    expect(shouldSeedDevData('development')).toBe(true);
  });

  it.each([
    ['undefined (unset)', undefined],
    ['test', 'test'],
    ['staging', 'staging'],
    ['production', 'production'],
    ['an empty string', ''],
    ['a different casing ("Development")', 'Development'],
  ])('returns false when NODE_ENV is %s', (_label, value) => {
    expect(shouldSeedDevData(value)).toBe(false);
  });
});
