import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkAppNavPrintSuppression,
  PRINT_CHROME_SELECTORS,
} from './check-app-nav-print-suppression';

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
// The original nav-only fixtures below pass the selector list explicitly; the
// checker's default is every chrome selector (PRINT_CHROME_SELECTORS).
const NAV_ONLY = ['.app-nav'];

describe('checkAppNavPrintSuppression', () => {
  // fresh review of ui-redesign-foundation PR 2: a descendant rule inside the
  // print block hides something INSIDE the nav, not the nav itself.
  it('does not accept a descendant rule as hiding .app-nav in print', () => {
    const css = `
      .app-nav { display: flex; }
      @media print {
        .app-nav .badge { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('display: none'),
    });
  });

  it('checks every chrome selector by default', () => {
    const css = `
      .app-nav { display: flex; }
      @media print {
        .app-nav { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css)).toEqual({
      ok: false,
      reason: '.app-footer { display: none } is missing inside the @media print block.',
    });
  });

  it('reports ok when the screen rule precedes @media print and .app-nav is hidden inside it', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
  });

  it('reports failure when a later .app-nav rule appears after @media print (the exact regression Decision 6 warns about)', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav { display: none; }
      }
      .app-nav { display: flex; }
    `;

    const result = checkAppNavPrintSuppression(css, NAV_ONLY);
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

    const result = checkAppNavPrintSuppression(css, NAV_ONLY);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('display: none'),
    });
  });

  it('reports failure when there is no @media print block at all', () => {
    const css = `.app-nav { display: flex; }`;

    const result = checkAppNavPrintSuppression(css, NAV_ONLY);
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

    const result = checkAppNavPrintSuppression(css, NAV_ONLY);
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

    expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
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

    const result = checkAppNavPrintSuppression(css, NAV_ONLY);
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

    expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
  });

  // code-review finding (second round): APP_NAV_HIDDEN_RULE/APP_NAV_VISIBLE_RULE
  // only matched a standalone `.app-nav { ... }` selector — a valid CSS
  // refactor to a grouped selector (e.g. `.app-nav, .drawer { display: none }`)
  // would false-negative and report the nav as NOT hidden/visible even though
  // it correctly is. APP_NAV_ANY_RULE already solved this exact problem with
  // a token-boundary regex; the two rules above must use the same approach.
  it('recognizes a grouped selector hiding .app-nav inside @media print', () => {
    const css = `
      .app-nav { display: flex; gap: 1rem; }
      @media print {
        .app-nav, .drawer { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
  });

  it('recognizes a grouped screen selector making .app-nav visible before @media print', () => {
    const css = `
      .app-nav, .toolbar { display: flex; }
      @media print {
        .app-nav { display: none; }
      }
    `;

    expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
  });

  // The regression guard the CRITICAL-1 finding actually asked for: run the
  // pure check against the REAL, shipped apps/web/src/index.css, not just
  // synthetic fixtures. This is the assertion that fails the moment a future
  // edit appends a screen .app-nav rule after the print block.
  it('holds for the real, shipped apps/web/src/index.css', () => {
    expect(checkAppNavPrintSuppression(cssSource)).toEqual({ ok: true });
  });

  // ui-redesign-foundation design Decision 7: the footer is application
  // chrome too, so the same three-part rule applies to every selector in
  // PRINT_CHROME_SELECTORS.
  describe('with several chrome selectors', () => {
    const shell = `
      .app-nav { display: flex; }
      .app-footer { display: flex; }
    `;

    it('reports ok when every selector is visible before and hidden inside @media print', () => {
      const css = `${shell}
        @media print {
          .app-nav { display: none; }
          .app-footer { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, PRINT_CHROME_SELECTORS)).toEqual({ ok: true });
    });

    it('names the footer when only the footer is not hidden in print', () => {
      const css = `${shell}
        @media print {
          .app-nav { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, PRINT_CHROME_SELECTORS)).toEqual({
        ok: false,
        reason: '.app-footer { display: none } is missing inside the @media print block.',
      });
    });

    it('names the footer when a footer rule follows @media print', () => {
      const css = `${shell}
        @media print {
          .app-nav { display: none; }
          .app-footer { display: none; }
        }
        .app-footer { display: flex; }
      `;

      const result = checkAppNavPrintSuppression(css, PRINT_CHROME_SELECTORS);
      expect(result).toMatchObject({
        ok: false,
        reason: expect.stringContaining('A .app-footer rule appears after'),
      });
    });

    it('does not false-match .app-footer-note as the footer', () => {
      const css = `${shell}
        @media print {
          .app-nav { display: none; }
          .app-footer { display: none; }
        }
        .app-footer-note { display: block; }
      `;

      expect(checkAppNavPrintSuppression(css, PRINT_CHROME_SELECTORS)).toEqual({ ok: true });
    });

    it('lists the nav and the footer as print chrome', () => {
      expect(PRINT_CHROME_SELECTORS).toEqual(['.app-nav', '.app-footer']);
    });

    it('holds for the real, shipped apps/web/src/index.css', () => {
      expect(checkAppNavPrintSuppression(cssSource, PRINT_CHROME_SELECTORS)).toEqual({
        ok: true,
      });
    });
  });

  // EN-83: the checker reads every print block (printBlocks), not only the
  // first. The selector must be hidden in one of them, its screen rule must
  // come before the first block hiding it, and no rule for it may follow the
  // last block hiding it.
  describe('with several print blocks', () => {
    it('accepts the nav hidden in a later print block', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .page { margin: 0; } }
        @media print and (min-width: 0) { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('accepts the nav hidden in a screen, print block', () => {
      const css = `
        .app-nav { display: flex; }
        @media screen, print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('reports failure when a nav rule follows the last block hiding it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .page { margin: 0; } }
        @media print { .app-nav { display: none; } }
        .app-nav { display: flex; }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason:
          'A .app-nav rule appears after the @media print block; it would win the source-order tie and make it print again.',
      });
    });

    it('reports failure when the screen rule comes only after the first block hiding the nav', () => {
      const css = `
        @media print { .app-nav { display: none; } }
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('must be declared before the @media print block'),
      });
    });

    it('reports an unclosed print block instead of throwing', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason: '@media print block is not properly closed.',
      });
    });
  });
});
