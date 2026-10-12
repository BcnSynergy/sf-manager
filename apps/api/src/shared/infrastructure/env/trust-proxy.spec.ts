import { getTrustProxySetting } from './trust-proxy';

describe('getTrustProxySetting', () => {
  it.each([undefined, '', 'false'])('returns false for %p', (value) => {
    expect(getTrustProxySetting({ TRUST_PROXY: value })).toBe(false);
  });

  it.each([
    ['true', 1],
    ['1', 1],
    ['2', 2],
    ['10', 10],
  ])('returns the hop count for %p', (value, hops) => {
    expect(getTrustProxySetting({ TRUST_PROXY: value })).toBe(hops);
  });

  it.each([
    '0',
    '-1',
    '1.5',
    '01',
    ' 2',
    '2 ',
    'TRUE',
    'yes',
    'loopback',
    '10.0.0.0/8',
    '1,2',
    '9007199254740993',
  ])('throws naming TRUST_PROXY and the raw value for %p', (value) => {
    expect(() => getTrustProxySetting({ TRUST_PROXY: value })).toThrow(
      /TRUST_PROXY/,
    );
    expect(() => getTrustProxySetting({ TRUST_PROXY: value })).toThrow(
      new RegExp(value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')),
    );
  });
});
