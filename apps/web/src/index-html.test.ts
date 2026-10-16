import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// web-visual-foundation spec "The Product Is Branded With Its Own Marks":
// the tab icon is the SF-Manager shield. Read from disk via process.cwd() for
// the reason given in styles/check-app-nav-print-suppression.test.ts.
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const shield = readFileSync(join(process.cwd(), 'public', 'favicon.svg'), 'utf8');

describe('index.html', () => {
  it('links the SF-Manager shield as the SVG favicon', () => {
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
    expect(shield).toMatch(/aria-label="SF-Manager"/);
    // The shield alone in a square box, in the brand red, with no text: the
    // lockup (logo.svg) has a wide viewBox and a second ink.
    expect(shield).toMatch(/viewBox="0 0 (\d+) \1"/);
    expect(shield.match(/fill="#[0-9a-f]{6}"/g)).toEqual(['fill="#c5052a"']);
    expect(shield).not.toMatch(/<text/);
  });

  it('keeps the document title', () => {
    expect(html).toMatch(/<title>SF-Manager<\/title>/);
  });
});
