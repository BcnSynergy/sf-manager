import { printBlocks, type PrintBlock } from './print-blocks';

// nav-menu/design.md Decision 6, verify-report CRITICAL-1 remediation: the
// screen `.app-nav` rule and the `@media print` rule that hides it share
// identical specificity (one class selector each), so CSS resolves the tie
// by SOURCE ORDER, not by the media query — whichever is declared LATER in
// the file wins during print. A pure, testable check so this invariant has
// a regression guard instead of resting on a one-time by-eye review.
export type PrintSuppressionResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

// ui-redesign-foundation design Decision 7: every piece of application chrome
// the redesign's shell renders around a page. Each must pass the same three
// checks as the original nav rule.
export const PRINT_CHROME_SELECTORS = ['.app-nav', '.app-footer'] as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The rules below match the selector as a token (not part of a longer class
// name like `.app-navbar`) anywhere in a comma/compound selector list that is
// still open when the next `{` is reached — e.g.
// `.app-nav, .drawer { display: none }` or `.app-nav.legacy { ... }`, not
// just a standalone `.app-nav { ... }`, so a valid grouped-selector CSS
// refactor doesn't false-negative this check.
function selectorRules(selector: string) {
  const name = `${escapeRegExp(selector)}(?![\\w-])`;
  const token = `${name}[^{}]*\\{`;
  // The hidden rule must target the selector itself: only whitespace or a
  // comma-separated list may follow it, so a descendant rule such as
  // `.app-nav .x { display: none }` does not count as hiding the chrome.
  const ownRule = `${name}\\s*(?:,[^{}]*)?\\{`;
  return {
    hidden: new RegExp(`${ownRule}[^}]*display:\\s*none[^}]*\\}`, 'i'),
    visible: new RegExp(`${token}[^}]*display:\\s*(?!none)[a-z-]+[^}]*\\}`, 'i'),
    any: new RegExp(token),
  };
}

// The text before `block` with every earlier print block cut out, so a rule
// inside a print block never counts as the screen rule.
function screenTextBefore(blocks: readonly PrintBlock[], block: PrintBlock): string {
  let text = '';
  let cursor = 0;
  for (const earlier of blocks) {
    const start = earlier.before.length;
    if (start >= block.before.length) break;
    // Defensive: printBlocks no longer returns a print block nested in
    // another (EN-84), but one would already be cut out.
    if (start < cursor) continue;
    text += block.before.slice(cursor, start);
    cursor = earlier.end;
  }
  return text + block.before.slice(cursor);
}

// The text after `block` with every later block in `hiding` cut out, since
// hiding the selector again cannot make it print.
function textAfter(block: PrintBlock, hiding: readonly PrintBlock[]): string {
  let text = '';
  let cursor = block.end;
  for (const later of hiding) {
    const start = later.before.length;
    if (start < cursor) continue;
    text += block.after.slice(cursor - block.end, start - block.end);
    cursor = later.end;
  }
  return text + block.after.slice(cursor - block.end);
}

// EN-83: reads every print block (printBlocks strips comments, so a stray
// `{`/`}` inside explanatory prose can't desync the scan). The selector must
// be hidden in a block that applies whenever the page prints (EN-87); its
// screen rule must come before the last such block, which wins the tie in
// print (EN-84); and no rule for it may follow that block, other than in
// another block hiding it.
export function checkAppNavPrintSuppression(
  rawCss: string,
  selectors: readonly string[] = PRINT_CHROME_SELECTORS,
): PrintSuppressionResult {
  let blocks: PrintBlock[];
  try {
    blocks = printBlocks(rawCss);
  } catch (error) {
    // EN-88: printBlocks names the query of the unclosed block.
    return { ok: false, reason: (error as Error).message };
  }
  if (blocks.length === 0) {
    return { ok: false, reason: 'No @media print block found in the stylesheet.' };
  }

  for (const selector of selectors) {
    const rules = selectorRules(selector);
    const hiding = blocks.filter((block) => rules.hidden.test(block.body));

    if (hiding.length === 0) {
      return {
        ok: false,
        reason: `${selector} { display: none } is missing inside the @media print block.`,
      };
    }

    const alwaysHiding = hiding.filter((block) => block.alwaysApplies);
    if (alwaysHiding.length === 0) {
      return {
        ok: false,
        reason: `${selector} is hidden only in @media print blocks that do not always apply (a conditional query, or nested in another rule); it would still print when they do not.`,
      };
    }

    const decisive = alwaysHiding[alwaysHiding.length - 1];
    if (!rules.visible.test(screenTextBefore(blocks, decisive))) {
      return {
        ok: false,
        reason: `The screen ${selector} rule must be declared before the @media print block, or the source-order tie is undetermined.`,
      };
    }

    if (rules.any.test(textAfter(decisive, hiding))) {
      return {
        ok: false,
        reason: `A ${selector} rule appears after the @media print block; it would win the source-order tie and make it print again.`,
      };
    }
  }

  return { ok: true };
}
