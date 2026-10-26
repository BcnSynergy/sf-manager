import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './zod-config';

// EN-94: the production CSP has no 'unsafe-eval', so Zod must not probe
// `new Function` (the probe is reported as a CSP violation).
describe('zod-config', () => {
  it('turns on jitless mode', () => {
    expect(z.config().jitless).toBe(true);
  });
});
