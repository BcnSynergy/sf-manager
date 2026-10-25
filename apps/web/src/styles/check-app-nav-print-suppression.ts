import postcss, {
  CssSyntaxError,
  type AtRule,
  type Container,
  type Node,
  type Rule,
} from 'postcss';
import { printBlocks } from './print-blocks';

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

// EN-83: a print block is any `@media` whose query list has a `print` media
// type (`print and (...)`, `only print`, `screen, print`).
const PRINT_MEDIA_QUERY = /^\s*(?:only\s+)?print(?![\w-])/i;
const PLAIN_PRINT_MEDIA_QUERY = /^\s*(?:only\s+)?print\s*$/i;
// A query for another media type (`screen`, `only screen and (...)`) never
// applies in print; one without a type, `all`, or a `not` query may.
const OTHER_MEDIA_TYPE_QUERY = /^\s*(?:only\s+)?(?!print(?![\w-])|all(?![\w-]))[a-z]/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queries(params: string): string[] {
  return params.split(',');
}

function isPrintBlock(node: Node): node is AtRule {
  return (
    node.type === 'atrule' &&
    (node as AtRule).name.toLowerCase() === 'media' &&
    queries((node as AtRule).params).some((query) => PRINT_MEDIA_QUERY.test(query))
  );
}

function mayApplyInPrint(media: AtRule): boolean {
  return queries(media.params).some(
    (query) => /^\s*not\s/i.test(query) || !OTHER_MEDIA_TYPE_QUERY.test(query),
  );
}

type Display = { readonly value: string; readonly important: boolean };

// EN-90: the `display` value a declaration block ends up with: its last
// `!important` one if there is any, otherwise its last one. A custom
// property such as `--nav-display` is not `display`. Only the block's own
// declarations count, not those of CSS nested in it (EN-96).
function effectiveDisplay(container: Container): Display | undefined {
  let winner: Display | undefined;
  for (const node of container.nodes ?? []) {
    if (node.type !== 'decl' || node.prop.toLowerCase() !== 'display') continue;
    const display = { value: node.value.trim().toLowerCase(), important: node.important };
    if (display.important || !winner?.important) winner = display;
  }
  return winner;
}

// Specificity as [ids, classes, types]. `:where()` counts nothing, and
// `:is()`, `:not()` and `:has()` count their most specific argument.
type Specificity = readonly [number, number, number];

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const ARGUMENT_PSEUDO_CLASSES = new Set(['is', 'not', 'has']);

function splitTopLevel(text: string, separator: (char: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '(' || text[i] === '[') depth += 1;
    else if (text[i] === ')' || text[i] === ']') depth -= 1;
    else if (depth === 0 && separator(text[i])) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function maxSpecificity(list: readonly Specificity[]): Specificity {
  return list.reduce<Specificity>((max, next) => (compare(next, max) > 0 ? next : max), [0, 0, 0]);
}

function specificity(selector: string): Specificity {
  let [ids, classes, types] = [0, 0, 0];
  const token =
    /\\.|#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?|[a-z][\w-]*|\*/gi;
  for (const match of selector.matchAll(token)) {
    const [text, argument] = match;
    if (text.startsWith('#')) ids += 1;
    else if (text.startsWith('.') || text.startsWith('[')) classes += 1;
    else if (text.startsWith('::')) types += 1;
    else if (text.startsWith(':')) {
      const name = text.slice(1).replace(/\(.*$/s, '').toLowerCase();
      if (name === 'where') continue;
      if (ARGUMENT_PSEUDO_CLASSES.has(name) && argument) {
        const inner = maxSpecificity(
          splitTopLevel(argument.slice(1, -1), (char) => char === ',').map(specificity),
        );
        [ids, classes, types] = [ids + inner[0], classes + inner[1], types + inner[2]];
      } else if (LEGACY_PSEUDO_ELEMENTS.has(name)) types += 1;
      else classes += 1;
    } else if (text !== '*' && !text.startsWith('\\')) types += 1;
  }
  return [ids, classes, types];
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// The last compound selector of an entry: the element the rule styles.
function subject(entry: string): string {
  const compounds = splitTopLevel(entry.trim(), (char) => /[\s>+~]/.test(char));
  return compounds.filter((compound) => compound !== '').at(-1) ?? '';
}

// A rule's selector entries with CSS nesting resolved against its parents.
function resolvedSelectors(rule: Rule): string[] {
  const parent = closestRule(rule.parent);
  if (!parent) return rule.selectors;
  return resolvedSelectors(parent).flatMap((outer) =>
    rule.selectors.map((inner) =>
      inner.includes('&') ? inner.replaceAll('&', outer) : `${outer} ${inner}`,
    ),
  );
}

function closestRule(node: Node | Container | undefined): Rule | undefined {
  for (let current = node; current; current = (current as Node).parent) {
    if (current.type === 'rule') return current as Rule;
  }
  return undefined;
}

// Every place that declares styles: style rules, and at-rules nested in a
// style rule that hold declarations (`.app-nav { @media (x) { gap: 0 } }`).
type StyleBlock = {
  readonly node: Container;
  readonly order: number;
  readonly selectors: readonly string[];
  readonly display: Display | undefined;
  // The outermost print block around it, if any.
  readonly printBlock: AtRule | undefined;
  readonly mayApplyInPrint: boolean;
};

type PrintBlock = {
  readonly node: AtRule;
  readonly order: number;
  readonly alwaysApplies: boolean;
};

function readStylesheet(root: Container) {
  const order = new Map<Node, number>();
  const styleBlocks: StyleBlock[] = [];
  const printBlocks: PrintBlock[] = [];
  root.walk((node) => {
    order.set(node, order.size);
    const ancestors: Node[] = [];
    let parent = node.parent as Node | undefined;
    for (; parent && parent.type !== 'root'; parent = parent.parent as Node | undefined) {
      ancestors.unshift(parent);
    }
    const outerPrint = ancestors.find(isPrintBlock);
    if (isPrintBlock(node) && !outerPrint) {
      printBlocks.push({
        node,
        order: order.get(node)!,
        // EN-87: the block applies whenever the page prints: its query list
        // has a plain `print` or `only print` query and it is not nested in
        // another rule (such as `@media screen`).
        alwaysApplies:
          node.parent?.type === 'root' &&
          queries(node.params).some((query) => PLAIN_PRINT_MEDIA_QUERY.test(query)),
      });
    }
    const rule = node.type === 'rule' ? node : closestRule(node.parent);
    const declares =
      node.type === 'rule' ||
      (node.type === 'atrule' && rule !== undefined && node.nodes?.some((n) => n.type === 'decl'));
    if (!declares || !rule) return;
    styleBlocks.push({
      node: node as Container,
      order: order.get(node)!,
      selectors: resolvedSelectors(rule),
      display: effectiveDisplay(node as Container),
      printBlock: isPrintBlock(node) && !outerPrint ? undefined : outerPrint,
      mayApplyInPrint: [...ancestors, node]
        .filter(
          (n): n is AtRule => n.type === 'atrule' && (n as AtRule).name.toLowerCase() === 'media',
        )
        .every(mayApplyInPrint),
    });
  });
  return { styleBlocks, printBlocks };
}

function isInside(node: Node, ancestor: Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

// EN-88: the message names the query of an unclosed `@media` block.
// postcss reports the innermost open block and drops a leading byte order
// mark, so an unclosed print block is found by printBlocks' own scan first.
function syntaxErrorReason(error: CssSyntaxError, rawCss: string): string {
  if (error.reason === 'Unclosed block') {
    try {
      printBlocks(rawCss);
    } catch (unclosed) {
      return (unclosed as Error).message;
    }
  }
  if (error.reason === 'Unclosed block' && error.line !== undefined) {
    const lines = rawCss.split('\n');
    const offset =
      lines.slice(0, error.line - 1).reduce((sum, line) => sum + line.length + 1, 0) +
      (error.column ?? 1) -
      1;
    const media = /^@media\s+([^{};]+)\{/i.exec(rawCss.slice(offset));
    if (media) {
      return `The @media ${media[1].trim().replace(/\s+/g, ' ')} block is not properly closed.`;
    }
  }
  return `The stylesheet could not be parsed: ${error.reason}.`;
}

// A hiding rule and the weight its `display: none` carries in the cascade.
type Hide = {
  readonly block: StyleBlock;
  readonly rank: readonly number[];
};

function rank(display: Display, specificityValue: Specificity, order: number): number[] {
  return [display.important ? 1 : 0, ...specificityValue, order];
}

// EN-83/84/87/89/96/97/98: reads the stylesheet with postcss and models the
// cascade in print. The selector must be hidden by a top-level rule of a
// block that applies whenever the page prints, naming the selector itself
// (EN-87, EN-90). Its screen rule must come before the last such block,
// which wins the tie in print (EN-84). No rule for it may follow that
// block's last hiding rule, other than in another block hiding it (EN-89).
// And no rule that may apply in print may show it with more weight, by
// `!important`, specificity, then order (EN-90, EN-97, EN-98).
export function checkAppNavPrintSuppression(
  rawCss: string,
  selectors: readonly string[] = PRINT_CHROME_SELECTORS,
): PrintSuppressionResult {
  let root: Container;
  try {
    root = postcss.parse(rawCss);
  } catch (error) {
    if (error instanceof CssSyntaxError) {
      return { ok: false, reason: syntaxErrorReason(error, rawCss) };
    }
    throw error;
  }

  const { styleBlocks, printBlocks: blocks } = readStylesheet(root);
  if (blocks.length === 0) {
    return { ok: false, reason: 'No @media print block found in the stylesheet.' };
  }

  for (const selector of selectors) {
    // Not part of a longer class name, escaped characters included.
    const token = new RegExp(`${escapeRegExp(selector)}(?![\\w\\\\-])`);
    // The selector entry that styles the chrome itself (EN-96): its subject,
    // without `:not(...)` arguments, names the selector.
    const target = (entry: string) => token.test(subject(entry).replace(/:not\([^)]*\)/gi, ''));
    const targetSpecificity = (block: StyleBlock) =>
      maxSpecificity(block.selectors.filter(target).map(specificity));
    const targets = (block: StyleBlock) => block.selectors.some(target);

    // A top-level rule of a print block that hides the selector itself.
    const hidesItself = (block: StyleBlock) =>
      block.printBlock !== undefined &&
      block.node.parent === block.printBlock &&
      block.node.type === 'rule' &&
      (block.node as Rule).selectors.some((entry) => entry.trim() === selector) &&
      block.display?.value === 'none';
    const toHide = (block: StyleBlock): Hide => ({
      block,
      rank: rank(block.display!, specificity(selector), block.order),
    });

    // Per print block, its last top-level rule hiding the selector itself.
    const lastHides = new Map<AtRule, StyleBlock>();
    for (const block of styleBlocks) {
      if (hidesItself(block)) lastHides.set(block.printBlock!, block);
    }

    if (lastHides.size === 0) {
      return {
        ok: false,
        reason: `${selector} { display: none } is missing inside the @media print block.`,
      };
    }

    const always = blocks.filter((block) => block.alwaysApplies && lastHides.has(block.node));
    if (always.length === 0) {
      return {
        ok: false,
        reason: `${selector} is hidden only in @media print blocks that do not always apply (a conditional query, or nested in another rule); it may still print, or the source-order tie cannot be confirmed.`,
      };
    }

    const decisiveBlock = always[always.length - 1];
    const decisive = lastHides.get(decisiveBlock.node)!;

    const screenRule = styleBlocks.some(
      (block) =>
        block.printBlock === undefined &&
        block.order < decisiveBlock.order &&
        targets(block) &&
        block.display !== undefined &&
        block.display.value !== 'none',
    );
    if (!screenRule) {
      return {
        ok: false,
        reason: `The screen ${selector} rule must be declared before the @media print block, or the source-order tie is undetermined.`,
      };
    }

    // A later block that hides the selector again covers the rules from its
    // start to its own last hide, since hiding it again cannot make it print.
    const coveredByLaterHide = (block: StyleBlock) => {
      const hide = block.printBlock && lastHides.get(block.printBlock);
      return (
        hide !== undefined &&
        (block.order <= hide.order || isInside(block.node as Node, hide.node as Node))
      );
    };
    // The hides that apply whenever the page prints.
    const alwaysHides = styleBlocks
      .filter(
        (block) => hidesItself(block) && always.some((found) => found.node === block.printBlock),
      )
      .map(toHide);

    // Why a show outranks every hide that applies whenever it does, if it
    // does. A hide in the show's own print block applies whenever it does.
    const outranks = (show: StyleBlock): string | undefined => {
      if (!show.mayApplyInPrint || !targets(show) || !show.display) return undefined;
      if (show.display.value === 'none') return undefined;
      const showRank = rank(show.display, targetSpecificity(show), show.order);
      const sameBlockHides = styleBlocks
        .filter((block) => show.printBlock !== undefined && block.printBlock === show.printBlock)
        .filter(hidesItself)
        .map(toHide);
      const strongest = [...alwaysHides, ...sameBlockHides].reduce((max, next) =>
        compare(next.rank, max.rank) > 0 ? next : max,
      );
      if (compare(showRank, strongest.rank) <= 0) return undefined;
      return show.display.important &&
        !strongest.block.display!.important &&
        show.order < strongest.block.order
        ? `An earlier ${selector} rule shows it with !important, which outranks the @media print block hiding it without !important; it would still print.`
        : `A ${selector} rule that may apply in print (${show.selectors.filter(target).join(', ')}) shows it with more weight than the @media print block hiding it; it would still print.`;
    };

    // Shows before the deciding hide are reported before a later rule, as
    // the earlier !important check was (EN-90).
    const earlierShow = styleBlocks
      .filter((block) => block.order < decisive.order)
      .map(outranks)
      .find((reason) => reason !== undefined);
    if (earlierShow) return { ok: false, reason: earlierShow };

    const later = styleBlocks.find(
      (block) =>
        block.order > decisive.order &&
        !isInside(block.node as Node, decisive.node as Node) &&
        targets(block) &&
        !coveredByLaterHide(block),
    );
    if (later) {
      return {
        ok: false,
        reason: `A ${selector} rule appears after the @media print block hides it; it would win the source-order tie and make it print again.`,
      };
    }

    const laterShow = styleBlocks
      .filter((block) => block.order >= decisive.order)
      .map(outranks)
      .find((reason) => reason !== undefined);
    if (laterShow) return { ok: false, reason: laterShow };
  }

  return { ok: true };
}
