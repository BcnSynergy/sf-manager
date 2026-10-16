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
    expect(shield).toMatch(/fill="#c5052a"/);
  });

  it('keeps the document title', () => {
    expect(html).toMatch(/<title>SF-Manager<\/title>/);
  });
});
