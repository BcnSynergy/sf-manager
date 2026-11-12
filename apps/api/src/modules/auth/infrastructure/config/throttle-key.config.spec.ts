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
    process.env.THROTTLE_KEY_SECRET = 'a-secret';

    expect(getThrottleKeySecret()).toBe('a-secret');
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
