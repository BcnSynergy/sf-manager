import { getTrustProxySetting } from './trust-proxy';

describe('getTrustProxySetting', () => {
  it.each([undefined, '', 'false'])('returns false for %p', (value) => {
    expect(getTrustProxySetting({ TRUST_PROXY: value })).toBe(false);
  });

  it('returns 1 (one trusted hop) for "true"', () => {
    expect(getTrustProxySetting({ TRUST_PROXY: 'true' })).toBe(1);
  });

  it('throws naming TRUST_PROXY for any other value', () => {
    expect(() => getTrustProxySetting({ TRUST_PROXY: 'yes' })).toThrow(
      /TRUST_PROXY/,
    );
  });
});
