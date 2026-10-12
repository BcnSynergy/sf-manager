import { toClientKey, UNRESOLVED_CLIENT_KEY } from './client-key';

describe('toClientKey', () => {
  it('exposes the shared fallback key', () => {
    expect(UNRESOLVED_CLIENT_KEY).toBe('unresolved');
  });

  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['198.51.100.1', '198.51.100.1'],
  ])('passes IPv4 %p through unchanged', (ip, expected) => {
    expect(toClientKey(ip)).toBe(expected);
  });

  it.each([
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:0DB8:0:0:ffff::2', '2001:db8:0:0::/64'],
    ['2001:db8:0:0:1:2:3:4', '2001:db8:0:0::/64'],
    ['2001:db8:0:1::1', '2001:db8:0:1::/64'],
    ['2001:db8:0:2::1', '2001:db8:0:2::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::', '0:0:0:0::/64'],
    ['64:ff9b::1.2.3.4', '64:ff9b:0:0::/64'],
  ])('maps IPv6 %p to its /64 key %p', (ip, expected) => {
    expect(toClientKey(ip)).toBe(expected);
  });

  it('gives different /64 prefixes different keys', () => {
    expect(toClientKey('2001:db8:0:1::1')).not.toBe(
      toClientKey('2001:db8:0:2::1'),
    );
  });

  it.each([
    '::ffff:198.51.100.7',
    '::ffff:c633:6407',
    '::FFFF:c633:6407',
    '0:0:0:0:0:ffff:c633:6407',
  ])('treats IPv4-mapped %p as IPv4 198.51.100.7', (ip) => {
    expect(toClientKey(ip)).toBe('198.51.100.7');
  });

  it.each([undefined, null, '', 42, {}, 'not-an-ip', '1.2.3', '2001:db8::g'])(
    'falls back to the shared key for %p without throwing',
    (ip) => {
      expect(toClientKey(ip)).toBe(UNRESOLVED_CLIENT_KEY);
    },
  );
});
