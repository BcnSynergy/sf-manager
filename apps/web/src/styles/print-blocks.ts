// EN-81: the print CSS tests read every `@media print` block of a
// stylesheet, with comments stripped first so a `{` or `}` (or the words
// `@media print`) inside explanatory prose cannot desync the brace scan.
export type PrintBlock = {
  // The block's content between its own braces.
  readonly body: string;
  // The stylesheet text after the block's closing brace.
  readonly after: string;
};

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const MEDIA_PRINT_START = /@media\s+print\s*\{/g;

export function printBlocks(rawCss: string): PrintBlock[] {
  const css = rawCss.replace(CSS_COMMENT, '');
  const blocks: PrintBlock[] = [];

  for (const match of css.matchAll(MEDIA_PRINT_START)) {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    for (; cursor < css.length && depth > 0; cursor += 1) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
    }
    if (depth !== 0) throw new Error('A @media print block is not properly closed.');

    blocks.push({ body: css.slice(bodyStart, cursor - 1), after: css.slice(cursor) });
  }

  return blocks;
}
