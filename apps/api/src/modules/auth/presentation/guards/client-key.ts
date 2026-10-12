import { isIP } from 'node:net';

// design.md Decision 3. Every request whose client IP is missing or
// unparsable shares this one bucket: still counted and limited, never an
// error, and a client cannot mint buckets with arbitrary strings.
export const UNRESOLVED_CLIENT_KEY = 'unresolved';

// Expands a well-formed (isIP === 6, zone id already stripped) IPv6 address
// into its eight 16-bit groups.
function expandIpv6(address: string): number[] {
  let text = address;
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const [a, b, c, d] = tail.split('.').map(Number);
    text =
      text.slice(0, lastColon + 1) +
      ((a << 8) | b).toString(16) +
      ':' +
      ((c << 8) | d).toString(16);
  }
  const [head, rest] = text.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const restGroups = rest === undefined || rest === '' ? [] : rest.split(':');
  const fill =
    rest === undefined ? 0 : 8 - headGroups.length - restGroups.length;
  return [
    ...headGroups,
    ...new Array<string>(fill).fill('0'),
    ...restGroups,
  ].map((group) => parseInt(group, 16));
}

// Maps the resolved client IP (req.ip) to the rate-limit client key: IPv4 as
// is, IPv4-mapped IPv6 as its IPv4, any other IPv6 as its canonical /64.
export function toClientKey(ip: unknown): string {
  if (typeof ip !== 'string' || ip === '') {
    return UNRESOLVED_CLIENT_KEY;
  }
  const address = ip.split('%')[0];
  const family = isIP(address);
  if (family === 4) {
    return address;
  }
  if (family !== 6) {
    return UNRESOLVED_CLIENT_KEY;
  }
  const groups = expandIpv6(address);
  const isMapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isMapped) {
    return [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}
