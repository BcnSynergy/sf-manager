import { createHmac } from 'node:crypto';

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

// Read at boot by AuthModule's factories: a missing secret stops startup.
export function getThrottleKeySecret(): string {
  const secret = process.env.THROTTLE_KEY_SECRET;
  if (!secret) {
    throw new Error('THROTTLE_KEY_SECRET environment variable is required');
  }
  return secret;
}

export const createThrottleKeyHasher =
  (secret: string): ThrottleKeyHasher =>
  (value) =>
    createHmac('sha256', secret).update(value).digest('hex');
