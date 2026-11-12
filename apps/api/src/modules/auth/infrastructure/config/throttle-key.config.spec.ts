import { createHash, createHmac } from 'node:crypto';
import {
  createThrottleKeyHasher,
  getThrottleKeySecret,
} from './throttle-key.config';

describe('getThrottleKeySecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when THROTTLE_KEY_SECRET is missing', () => {
    delete process.env.THROTTLE_KEY_SECRET;

    expect(() => getThrottleKeySecret()).toThrow(
      'THROTTLE_KEY_SECRET environment variable is required',
    );
  });

  it('throws when THROTTLE_KEY_SECRET is empty', () => {
    process.env.THROTTLE_KEY_SECRET = '';

    expect(() => getThrottleKeySecret()).toThrow(/THROTTLE_KEY_SECRET/);
  });

  it('returns the configured secret', () => {
    process.env.THROTTLE_KEY_SECRET = 'a'.repeat(32);

    expect(getThrottleKeySecret()).toBe('a'.repeat(32));
  });

  // EN-180: the strength rules shared with JWT_SECRET (readSecret).
  it('throws when THROTTLE_KEY_SECRET is shorter than 32 characters', () => {
    process.env.THROTTLE_KEY_SECRET = 'a'.repeat(31);

    expect(() => getThrottleKeySecret()).toThrow(
      'THROTTLE_KEY_SECRET must be at least 32 characters long, got 31',
    );
  });

  it('throws when THROTTLE_KEY_SECRET has surrounding whitespace', () => {
    process.env.THROTTLE_KEY_SECRET = `${'a'.repeat(32)} `;

    expect(() => getThrottleKeySecret()).toThrow(
      'THROTTLE_KEY_SECRET must not start or end with whitespace',
    );
  });

  it('throws when THROTTLE_KEY_SECRET equals JWT_SECRET', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.THROTTLE_KEY_SECRET = 'a'.repeat(32);

    expect(() => getThrottleKeySecret()).toThrow(
      new Error('THROTTLE_KEY_SECRET must differ from JWT_SECRET'),
    );
  });

  it('accepts a THROTTLE_KEY_SECRET that differs from JWT_SECRET', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.THROTTLE_KEY_SECRET = 'b'.repeat(32);

    expect(getThrottleKeySecret()).toBe('b'.repeat(32));
  });
});

describe('createThrottleKeyHasher', () => {
  it('returns the HMAC-SHA-256 hex digest of the value under the secret', () => {
    const hash = createThrottleKeyHasher('a-secret');

    expect(hash('login-email:a@example.com')).toBe(
      createHmac('sha256', 'a-secret')
        .update('login-email:a@example.com')
        .digest('hex'),
    );
  });

  it('differs from the unkeyed SHA-256 and between secrets', () => {
    const value = 'login-email:a@example.com';
    const first = createThrottleKeyHasher('first-secret')(value);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(createHash('sha256').update(value).digest('hex'));
    expect(first).not.toBe(createThrottleKeyHasher('second-secret')(value));
  });
});
