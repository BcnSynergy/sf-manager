import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAppNavPrintSuppression } from './check-app-nav-print-suppression';

// `?raw` Vite imports and `import.meta.url`-relative resolution both proved
// unreliable under this project's jsdom vitest environment (verified
// experimentally: `?raw` returned an empty string, and `new URL('../index.css',
// import.meta.url)` resolved against jsdom's `http://localhost:3000` base
// instead of the real file path). Vitest's working directory for this
// workspace is `apps/web` (matches `npm run test --workspace=apps/web`), so
// the real stylesheet is read directly from disk via `process.cwd()` instead.
const INDEX_CSS_PATH = join(process.cwd(), 'src', 'index.css');
const cssSource = readFileSync(INDEX_CSS_PATH, 'utf8');

// nav-menu verify-report CRITICAL-1: tasks.md 3.13 and the apply-progress
// artifact both claimed an "already-passing automated CSS-source-order test"
// that never existed. This file is that test. design.md Decision 6 states
// the requirement in prose: the screen `.app-nav` rule and the `@media
// print` rule share identical specificity, so CSS breaks the tie by SOURCE
// ORDER — whichever is declared later in the file wins during print,
// regardless of the media query. `checkAppNavPrintSuppression` is a pure
// function so the detection logic itself can be triangulated against
// synthetic fixtures, independent of whatever apps/web/src/index.css
// currently contains.
describe('checkAppNavPrintSuppression', () => {
  it('reports ok when the screen rule precedes @media print and .app-nav is hidden inside it', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css)).toEqual({ ok: true });
  });

  it('reports failure when a later .app-nav rule appears after @media print (the exact regression Decision 6 warns about)', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav { display: none; }
      }
      .app-nav { display: flex; }
    `;

    const result = checkAppNavPrintSuppression(css);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('after the @media print block'),
    });
  });

  it('reports failure when @media print never suppresses .app-nav', () => {
    const css = `
      .app-nav { display: flex; }
      @media print {
        .label-print { color: #000; }
      }
    `;

    const result = checkAppNavPrintSuppression(css);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('display: none'),
    });
  });

  it('reports failure when there is no @media print block at all', () => {
    const css = `.app-nav { display: flex; }`;

    const result = checkAppNavPrintSuppression(css);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('No @media print block'),
    });
  });

  it('reports failure when the screen rule is missing before @media print', () => {
    const css = `
      @media print {
        .app-nav { display: none; }
      }
    `;

    const result = checkAppNavPrintSuppression(css);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('before the @media print block'),
    });
  });

  // code-review finding on the guard itself: a comment containing an
  // unbalanced brace must not desync the brace-depth scan used to find the
  // end of the @media print block.
  it('is not confused by a comment containing a stray brace inside @media print', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        /* a note with a stray } in it */
        .app-nav { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css)).toEqual({ ok: true });
  });

  // code-review finding on the guard itself: a compound/grouped selector
  // reintroducing .app-nav after @media print must still be caught — not
  // just a standalone `.app-nav {` — and `.app-navbar` must NOT false-match.
  it('reports failure when a grouped selector reintroduces .app-nav after @media print', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav { display: none; }
      }
      .app-nav, .some-other-class { display: flex; }
    `;

    const result = checkAppNavPrintSuppression(css);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('after the @media print block'),
    });
  });

  it('does not false-match .app-navbar as a .app-nav rule after @media print', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav { display: none; }
      }
      .app-navbar { display: flex; }
    `;

    expect(checkAppNavPrintSuppression(css)).toEqual({ ok: true });
  });

  // The regression guard the CRITICAL-1 finding actually asked for: run the
  // pure check against the REAL, shipped apps/web/src/index.css, not just
  // synthetic fixtures. This is the assertion that fails the moment a future
  // edit appends a screen .app-nav rule after the print block.
  it('holds for the real, shipped apps/web/src/index.css', () => {
    expect(checkAppNavPrintSuppression(cssSource)).toEqual({ ok: true });
  });
});
