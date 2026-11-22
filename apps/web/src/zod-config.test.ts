import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './zod-config';

// EN-94: the production CSP has no 'unsafe-eval', so Zod must not probe
// `new Function` (the probe is reported as a CSP violation).
describe('zod-config', () => {
  it('turns on jitless mode', () => {
    expect(z.config().jitless).toBe(true);
  });

  // EN-106: jitless only helps if it is set before any schema is built, and
  // App's imports build schemas as soon as they are evaluated.
  it('is the first import of main.tsx', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'main.tsx'), 'utf8');
    const firstImport = source.match(/^import\s[^;]*;/m)?.[0];

    expect(firstImport).toBe("import './zod-config';");
  });
});
