// nav-menu/design.md Decision 6, verify-report CRITICAL-1 remediation: the
// screen `.app-nav` rule and the `@media print` rule that hides it share
// identical specificity (one class selector each), so CSS resolves the tie
// by SOURCE ORDER, not by the media query — whichever is declared LATER in
// the file wins during print. A pure, testable check so this invariant has
// a regression guard instead of resting on a one-time by-eye review.
export type PrintSuppressionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
// Only inspects the FIRST `@media print` block in the stylesheet (no `/g`
// loop) — a KNOWN, ACCEPTED limitation. `apps/web/src/index.css` has exactly
// one `@media print` block today; if a future edit adds a second one, this
// checker will silently ignore it. Full multi-block support is out of scope
// for this single-purpose regression guard (walking-skeleton discipline) —
// revisit this file if/when a second `@media print` block is introduced.
const MEDIA_PRINT_START = /@media\s+print\s*\{/;
// Both rules below match `.app-nav` as a selector token (not part of a
// longer class name like `.app-navbar`) anywhere in a comma/compound
// selector list that is still open when the next `{` is reached — e.g.
// `.app-nav, .drawer { display: none }` or `.app-nav.legacy { ... }`, not
// just a standalone `.app-nav { ... }`. Same token-boundary approach as
// APP_NAV_ANY_RULE below, applied consistently so a valid grouped-selector
// CSS refactor doesn't false-negative this check.
const APP_NAV_HIDDEN_RULE = /\.app-nav(?![\w-])[^{}]*\{[^}]*display:\s*none[^}]*\}/i;
const APP_NAV_VISIBLE_RULE = /\.app-nav(?![\w-])[^{}]*\{[^}]*display:\s*(?!none)[a-z-]+[^}]*\}/i;
// Matches `.app-nav` as a selector token (not part of a longer class name
// like `.app-navbar`) anywhere in a comma/compound selector list that is
// still open when the next `{` is reached — e.g. `.app-nav, .foo {` or
// `.app-nav.legacy {`, not just a standalone `.app-nav {`.
const APP_NAV_ANY_RULE = /\.app-nav(?![\w-])[^{}]*\{/;

export function checkAppNavPrintSuppression(rawCss: string): PrintSuppressionResult {
  // Strip comments first so a stray `{`/`}` inside explanatory prose (this
  // file's own header comment does exactly that) can't desync the
  // brace-depth scan below or the selector-detection regexes.
  const css = rawCss.replace(CSS_COMMENT, '');
  const startMatch = MEDIA_PRINT_START.exec(css);
  if (!startMatch) {
    return { ok: false, reason: 'No @media print block found in the stylesheet.' };
  }

  const blockBodyStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let cursor = blockBodyStart;
  for (; cursor < css.length && depth > 0; cursor++) {
    if (css[cursor] === '{') depth++;
    else if (css[cursor] === '}') depth--;
  }
  if (depth !== 0) {
    return { ok: false, reason: '@media print block is not properly closed.' };
  }

  const blockBodyEnd = cursor - 1; // index of the @media print block's own closing brace
  const mediaPrintBody = css.slice(blockBodyStart, blockBodyEnd);
  const before = css.slice(0, startMatch.index);
  const after = css.slice(cursor);

  if (!APP_NAV_HIDDEN_RULE.test(mediaPrintBody)) {
    return {
      ok: false,
      reason: '.app-nav { display: none } is missing inside the @media print block.',
    };
  }

  if (!APP_NAV_VISIBLE_RULE.test(before)) {
    return {
      ok: false,
      reason:
        'The screen .app-nav rule must be declared before the @media print block, or the source-order tie is undetermined.',
    };
  }

  if (APP_NAV_ANY_RULE.test(after)) {
    return {
      ok: false,
      reason:
        'A .app-nav rule appears after the @media print block; it would win the source-order tie and make the nav print again.',
    };
  }

  return { ok: true };
}
