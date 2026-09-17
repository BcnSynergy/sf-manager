// nav-menu/design.md Decision 6, verify-report CRITICAL-1 remediation: the
// screen `.app-nav` rule and the `@media print` rule that hides it share
// identical specificity (one class selector each), so CSS resolves the tie
// by SOURCE ORDER, not by the media query — whichever is declared LATER in
// the file wins during print. A pure, testable check so this invariant has
// a regression guard instead of resting on a one-time by-eye review.
export type PrintSuppressionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const MEDIA_PRINT_START = /@media\s+print\s*\{/;
const APP_NAV_HIDDEN_RULE = /\.app-nav\s*\{[^}]*display:\s*none[^}]*\}/i;
const APP_NAV_VISIBLE_RULE = /\.app-nav\s*\{[^}]*display:\s*(?!none)[a-z-]+[^}]*\}/i;
const APP_NAV_ANY_RULE = /\.app-nav\s*\{/;

export function checkAppNavPrintSuppression(css: string): PrintSuppressionResult {
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
