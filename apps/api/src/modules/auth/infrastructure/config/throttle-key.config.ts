import { createHmac } from 'node:crypto';
import { readSecret } from './secret.config';

// EN-6: throttle counter keys (per client key and per email) are stored and
// logged as HMAC-SHA-256 digests under THROTTLE_KEY_SECRET. An unkeyed hash
// of an IPv4 address or an email can be recomputed from candidates, so
// anyone who can read the table or the logs could learn which addresses or
// accounts were throttled; without the secret they cannot.
//
// The secret is separate from JWT_SECRET so that rotating either one leaves
// the other alone. Rotating THROTTLE_KEY_SECRET only resets the counters and
// any active blocks, since every key changes.
export type ThrottleKeyHasher = (value: string) => string;

// EN-181: DI token for the single hasher shared by both counter families
// (ThrottleKeyModule provides it).
export const THROTTLE_KEY_HASHER = Symbol('THROTTLE_KEY_HASHER');

// Read once at boot by ThrottleKeyModule's THROTTLE_KEY_HASHER factory
// (EN-181): a missing or weak secret, or one equal to JWT_SECRET, stops
// startup (EN-180, see secret.config.ts).
export function getThrottleKeySecret(): string {
  const secret = readSecret('THROTTLE_KEY_SECRET');
  if (secret === process.env.JWT_SECRET) {
    throw new Error('THROTTLE_KEY_SECRET must differ from JWT_SECRET');
  }
  return secret;
}

export const createThrottleKeyHasher =
  (secret: string): ThrottleKeyHasher =>
  (value) =>
    createHmac('sha256', secret).update(value).digest('hex');
