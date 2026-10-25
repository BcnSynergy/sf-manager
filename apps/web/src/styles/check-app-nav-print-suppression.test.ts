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
  // come before the last block hiding it (EN-84; EN-87 below for conditional
  // blocks), and no rule for it may follow that block.
  describe('with several print blocks', () => {
    it('accepts the nav hidden in a later print block', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .page { margin: 0; } }
        @media only print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    // The block hides the nav on screen too; screen visibility is outside
    // this guard, which only checks that the chrome does not print.
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
          'A .app-nav rule appears after the @media print block hides it; it would win the source-order tie and make it print again.',
      });
    });

    // EN-84: the last block hiding the nav wins the tie, so the page prints
    // without the nav.
    it('accepts a screen rule between two blocks hiding the nav', () => {
      const css = `
        @media print { .app-nav { display: none; } }
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('does not take a rule inside an earlier print block as the screen rule', () => {
      const css = `
        @media print { .app-nav { display: block; } }
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
        reason: 'The @media print block is not properly closed.',
      });
    });

    // EN-88: the reason names the query, as printBlocks does.
    it('names the query of an unclosed print block', () => {
      const css = `
        .app-nav { display: flex; }
        @media screen, print { .app-nav { display: none; }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason: 'The @media screen, print block is not properly closed.',
      });
    });
  });

  // EN-87: only a block that applies whenever the page prints (a plain
  // `print` or `only print` query, not nested in another rule) decides the
  // tie. A conditional block, or one nested in `@media screen`, does not.
  describe('with conditional print blocks', () => {
    const LANDSCAPE = '@media print and (orientation: landscape)';

    it('reports failure when the nav is hidden only in a conditional print block', () => {
      const css = `
        .app-nav { display: flex; }
        ${LANDSCAPE} { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason:
          '.app-nav is hidden only in @media print blocks that do not always apply (a conditional query, or nested in another rule); it may still print, or the source-order tie cannot be confirmed.',
      });
    });

    it('reports failure when the nav is hidden only in a print block nested in @media screen', () => {
      const css = `
        .app-nav { display: flex; }
        @media screen { @media print { .app-nav { display: none; } } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('that do not always apply'),
      });
    });

    it('reports failure when the screen rule comes after the last plain block hiding the nav', () => {
      const css = `
        @media print { .app-nav { display: none; } }
        .app-nav { display: flex; }
        ${LANDSCAPE} { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('must be declared before the @media print block'),
      });
    });

    it('reports failure when the screen rule comes after a plain block and before a nested one', () => {
      const css = `
        @media print { .app-nav { display: none; } }
        .app-nav { display: flex; }
        @media screen { @media print { .app-nav { display: none; } } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('must be declared before the @media print block'),
      });
    });

    it('reports failure when the nav is hidden only in a print block nested in @layer', () => {
      const css = `
        .app-nav { display: flex; }
        @layer print-chrome { @media print { .app-nav { display: none; } } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('the source-order tie cannot be confirmed'),
      });
    });

    it('accepts a second plain block hiding the nav right after the first', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('accepts a conditional block hiding the nav after the plain one', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        ${LANDSCAPE} { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('reports failure when a nav rule follows the plain block, even before a conditional one', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        .app-nav { display: block; }
        ${LANDSCAPE} { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('appears after the @media print block'),
      });
    });

    it('reports failure when a later plain block shows the nav again after hiding it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        @media print { .app-nav { display: none; } .app-nav { display: block; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('appears after the @media print block hides it'),
      });
    });

    it('reports failure when a later conditional block shows the nav again after hiding it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        ${LANDSCAPE} { .app-nav { display: none; } .app-nav { display: block; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('appears after the @media print block hides it'),
      });
    });

    it('reports failure when a conditional block shows the nav again after the plain one', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        ${LANDSCAPE} { .app-nav { display: block; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('appears after the @media print block'),
      });
    });
  });

  // EN-89: inside a print block, only its last top-level hiding rule counts.
  describe('with rule order inside a print block', () => {
    it('reports failure when the block shows the nav again after hiding it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } .app-nav { display: block; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason:
          'A .app-nav rule appears after the @media print block hides it; it would win the source-order tie and make it print again.',
      });
    });

    it('reports failure when a rule nested in the block shows the nav after hiding it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print {
          .app-nav { display: none; }
          @supports (display: grid) { .app-nav { display: block; } }
        }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('appears after the @media print block hides it'),
      });
    });

    it('accepts a block that shows the nav before hiding it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: block; } .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it.each(['@media print and (color)', '@supports (display: grid)'])(
      'reports failure when the nav is hidden only inside a nested "%s"',
      (rule) => {
        const css = `
          .app-nav { display: flex; }
          @media print { ${rule} { .app-nav { display: none; } } }
        `;

        expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
          ok: false,
          reason: '.app-nav { display: none } is missing inside the @media print block.',
        });
      },
    );
  });

  // EN-90: the check reads each rule's declarations, so only the display
  // value that wins in the cascade counts, and only for the selector itself.
  describe('with declaration and selector shapes', () => {
    it.each([
      ['a descendant rule', '.foo .app-nav { display: none; }'],
      ['a rule that shows the nav again', '.app-nav { display: none; display: block; }'],
      ['a custom property', '.app-nav { --nav-display: none; }'],
    ])('does not accept %s as hiding the nav in print', (_label, rule) => {
      const css = `
        .app-nav { display: flex; }
        @media print { ${rule} }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason: '.app-nav { display: none } is missing inside the @media print block.',
      });
    });

    it('accepts a rule whose important hide outranks a later show', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none !important; display: block; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('does not accept a custom property as the screen rule', () => {
      const css = `
        .app-nav { --nav-display: flex; }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason:
          'The screen .app-nav rule must be declared before the @media print block, or the source-order tie is undetermined.',
      });
    });

    it('reports failure when an earlier important show outranks the print hide', () => {
      const css = `
        .app-nav { display: flex !important; }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason:
          'An earlier .app-nav rule shows it with !important, which outranks the @media print block hiding it without !important; it would still print.',
      });
    });

    it('accepts an important print hide after an important show', () => {
      const css = `
        .app-nav { display: flex !important; }
        @media print { .app-nav { display: none !important; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it.each([
      ['a selector', '&:hover { color: red; }'],
      ['a media query', '@media (max-width: 600px) { gap: 0; }'],
    ])('accepts a screen rule that nests %s', (_label, nested) => {
      const css = `
        .app-nav { display: flex; ${nested} }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    // The selector in an at-rule prelude must not hide the rule inside it.
    it('reads a screen rule inside an at-rule that names the selector', () => {
      const css = `
        @supports selector(.app-nav) { .app-nav { display: flex; } }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('reports failure when an important show sits inside an at-rule that names the selector', () => {
      const css = `
        .app-nav { display: flex; }
        @media print {
          @supports selector(.app-nav) { .app-nav { display: grid !important; } }
          .app-nav { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('shows it with !important'),
      });
    });

    it('reports failure when an important show in an at-rule just before the hide outranks it', () => {
      const css = `
        .app-nav { display: flex; }
        @media print {
          @supports (display: grid) { .app-nav { display: grid !important; } }
          .app-nav { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('shows it with !important'),
      });
    });
  });

  // EN-96, EN-97, EN-98: the check models the cascade in print, so a rule
  // counts only when it styles the chrome itself and may apply in print, and
  // a show must outrank the hide by !important, specificity, then order.
  describe('with the cascade in print', () => {
    it.each([
      [
        'a descendant rule after the hide',
        '.app-nav { display: flex; } @media print { .app-nav { display: none; } .app-nav a { color: black; } }',
      ],
      [
        'a hiding rule that nests CSS',
        '.app-nav { display: flex; } @media print { .app-nav { display: none; &:hover { color: red; } } }',
      ],
      [
        'an important show in @media screen',
        '.app-nav { display: flex; } @media screen { .app-nav { display: flex !important; } } @media print { .app-nav { display: none; } }',
      ],
      [
        'an important show on a descendant',
        '.app-nav { display: flex; } .app-nav a { display: block !important; } @media print { .app-nav { display: none; } }',
      ],
      [
        'an important hide followed by a plain hide',
        '.app-nav { display: flex !important; } @media print { .app-nav { display: none !important; } .app-nav { display: none; } }',
      ],
      [
        'a show whose extra selector counts nothing',
        ':where(.shell) .app-nav { display: flex; } @media print { .app-nav { display: none; } }',
      ],
    ])('accepts %s', (_label, css) => {
      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });

    it('does not accept a hide on a compound selector, which may miss other elements', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { nav.app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason: '.app-nav { display: none } is missing inside the @media print block.',
      });
    });

    it.each([
      [
        'with !important',
        '.shell .app-nav { display: flex !important; }',
        'display: none !important',
      ],
      ['without !important', '.shell .app-nav { display: flex; }', 'display: none'],
    ])(
      'reports failure when a more specific show outranks the print hide %s',
      (_label, show, hide) => {
        const css = `
          .app-nav { display: flex; }
          ${show}
          @media print { .app-nav { ${hide}; } }
        `;

        expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
          ok: false,
          reason:
            'A .app-nav rule that may apply in print (.shell .app-nav) shows it with more weight than the @media print block hiding it; it would still print.',
        });
      },
    );

    it('reports failure when a later important show outranks an earlier important hide', () => {
      const css = `
        .app-nav { display: flex; }
        @media print {
          .app-nav { display: none !important; }
          .app-nav { display: block !important; }
          .app-nav { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('shows it with more weight'),
      });
    });

    it('reports failure when an important show sits in a later conditional print block', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        @media print and (min-width: 1px) {
          .app-nav { display: flex !important; }
          .app-nav { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('shows it with !important'),
      });
    });

    it('accepts a later conditional print block that shows the nav before hiding it again', () => {
      const css = `
        .app-nav { display: flex; }
        @media print { .app-nav { display: none; } }
        @media print and (min-width: 1px) {
          .app-nav { display: flex; }
          .app-nav { display: none; }
        }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });
  });

  // Pre-push verification of print-check-cascade: the reasons main gave for
  // these shapes stay the same.
  describe('with the reasons kept from the previous check', () => {
    it.each([
      [
        'an unclosed rule inside it',
        '.app-nav { display: flex; }\n@media print { .app-nav { display: none;',
      ],
      [
        'an unclosed at-rule inside it',
        '.app-nav { display: flex; } @media print { .app-nav { display: none; } @supports (x: y) { .a { color: red; }',
      ],
      ['a byte order mark before it', '﻿@media print { .app-nav { display: none; }'],
    ])('names an unclosed print block with %s', (_label, css) => {
      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason: 'The @media print block is not properly closed.',
      });
    });

    it('reports an earlier important show before a later rule', () => {
      const css = `
        .app-nav { display: flex !important; }
        @media print { .app-nav { display: none; } }
        .app-nav { color: red; }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({
        ok: false,
        reason:
          'An earlier .app-nav rule shows it with !important, which outranks the @media print block hiding it without !important; it would still print.',
      });
    });

    it('does not take an escaped longer class name for the nav', () => {
      const css = `
        .app-nav { display: flex; }
        .app-nav\\:x { display: flex !important; }
        @media print { .app-nav { display: none; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toEqual({ ok: true });
    });
  });
  // Pre-merge review of print-check-cascade: `&`, and declarations directly
  // in a group rule nested in a style rule, take the specificity of
  // `:is(<the whole parent selector list>)`.
  describe('with nesting under a selector list', () => {
    it.each([
      [
        'a nested media query',
        '.app-nav, .shell .nav { @media (min-width: 40rem) { display: flex; } }',
        'display: none',
      ],
      ['a nested & rule', '.app-nav, .shell .nav { & { display: flex; } }', 'display: none'],
      [
        'a nested important media query',
        '.app-nav, #x { @media (min-width: 40rem) { display: flex !important; } }',
        'display: none !important',
      ],
    ])('reports failure when %s outranks the print hide', (_label, show, hide) => {
      const css = `
        ${show}
        @media print { .app-nav { ${hide}; } }
      `;

      expect(checkAppNavPrintSuppression(css, NAV_ONLY)).toMatchObject({
        ok: false,
        reason: expect.stringContaining('shows it with more weight'),
      });
    });
  });
});
