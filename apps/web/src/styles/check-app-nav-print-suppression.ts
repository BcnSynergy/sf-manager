import { printBlocks, topLevelStyleRules, type PrintBlock } from './print-blocks';

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

// A print block that hides the selector, and the offset just past its last
// top-level hiding rule.
type Hider = { readonly block: PrintBlock; readonly hideEnd: number };

// EN-89: only a top-level rule of the block hides the selector, and only
// its last one counts, since a rule after it would win the tie.
function hider(block: PrintBlock, hidden: RegExp): Hider | undefined {
  const bodyStart = block.end - 1 - block.body.length;
  let hideEnd = -1;
  for (const rule of topLevelStyleRules(block.body)) {
    // A nested rule (`.x { .app-nav { ... } }`) targets a descendant.
    if (!rule.body.includes('{') && hidden.test(`${rule.prelude}{${rule.body}}`)) {
      hideEnd = bodyStart + rule.end;
    }
  }
  return hideEnd === -1 ? undefined : { block, hideEnd };
}

// The text after the last hiding rule of `decisive`, with every later span
// from a block's start to its own last hiding rule cut out, since hiding the
// selector again cannot make it print.
function textAfter(decisive: Hider, hiders: readonly Hider[]): string {
  const { block } = decisive;
  const bodyStart = block.end - 1 - block.body.length;
  const rest = `${block.body}}${block.after}`;
  let text = '';
  let cursor = decisive.hideEnd;
  for (const later of hiders) {
    const start = later.block.before.length;
    if (start < cursor) continue;
    text += rest.slice(cursor - bodyStart, start - bodyStart);
    cursor = later.hideEnd;
  }
  return text + rest.slice(cursor - bodyStart);
}

// EN-83: reads every print block (printBlocks strips comments, so a stray
// `{`/`}` inside explanatory prose can't desync the scan). The selector must
// be hidden by a top-level rule of a block that applies whenever the page
// prints (EN-87); its screen rule must come before the last such block, which
// wins the tie in print (EN-84); and no rule for it may follow that block's
// last hiding rule, other than in another block hiding it (EN-89).
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
    const hiding = blocks
      .map((block) => hider(block, rules.hidden))
      .filter((found): found is Hider => found !== undefined);

    if (hiding.length === 0) {
      return {
        ok: false,
        reason: `${selector} { display: none } is missing inside the @media print block.`,
      };
    }

    const alwaysHiding = hiding.filter((found) => found.block.alwaysApplies);
    if (alwaysHiding.length === 0) {
      return {
        ok: false,
        reason: `${selector} is hidden only in @media print blocks that do not always apply (a conditional query, or nested in another rule); it may still print, or the source-order tie cannot be confirmed.`,
      };
    }

    const decisive = alwaysHiding[alwaysHiding.length - 1];
    if (!rules.visible.test(screenTextBefore(blocks, decisive.block))) {
      return {
        ok: false,
        reason: `The screen ${selector} rule must be declared before the @media print block, or the source-order tie is undetermined.`,
      };
    }

    if (rules.any.test(textAfter(decisive, hiding))) {
      return {
        ok: false,
        reason: `A ${selector} rule appears after the @media print block hides it; it would win the source-order tie and make it print again.`,
      };
    }
  }

  return { ok: true };
}
