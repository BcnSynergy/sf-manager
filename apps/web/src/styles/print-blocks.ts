// EN-81: the print CSS tests read every `@media print` block of a
// stylesheet, with comments stripped first so a `{` or `}` (or the words
// `@media print`) inside explanatory prose cannot desync the brace scan.
// EN-83: a print block is any `@media` whose query list has a `print` media
// type (`print and (...)`, `only print`, `screen, print`), and comment
// markers and braces inside strings are left alone.
// Queries without a media type (`@media all`, `@media (min-width: 0)`) also
// apply in print, but their rules are not read as print rules.
export type PrintBlock = {
  // The stylesheet text before the block's `@media`.
  readonly before: string;
  // The block's content between its own braces.
  readonly body: string;
  // The stylesheet text after the block's closing brace.
  readonly after: string;
  // The offset just past the closing brace in the comment-stripped text; the
  // block starts at `before.length`.
  readonly end: number;
};

// Sticky: matched only at the `@` the scan in printBlocks is on.
const MEDIA_RULE_START = /@media\s+([^{};]+)\{/iy;
const PRINT_MEDIA_QUERY = /^\s*(?:only\s+)?print(?![\w-])/i;
const NEWLINE = /[\n\r\f]/;

// The index of the quote that closes the string opened at `start`. A string
// that never closes ends before the next newline, as in CSS (EN-84), or at the
// last index. A backslash escapes the next character, or the whole CRLF line
// break.
function stringEnd(css: string, start: number): number {
  for (let i = start + 1; i < css.length; i += 1) {
    if (css[i] === '\\') i += css.startsWith('\r\n', i + 1) ? 2 : 1;
    else if (NEWLINE.test(css[i])) return i - 1;
    else if (css[i] === css[start]) return i;
  }
  return css.length - 1;
}

function isQuote(char: string): boolean {
  return char === '"' || char === "'";
}

function stripComments(css: string): string {
  let result = '';
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '\\') {
      result += css.slice(i, i + 2);
      i += 1;
    } else if (isQuote(css[i])) {
      const end = stringEnd(css, i);
      result += css.slice(i, end + 1);
      i = end;
    } else if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
    } else {
      result += css[i];
    }
  }
  return result;
}

function isPrintQuery(queryList: string): boolean {
  return queryList.split(',').some((query) => PRINT_MEDIA_QUERY.test(query));
}

export function printBlocks(rawCss: string): PrintBlock[] {
  const css = stripComments(rawCss);
  const blocks: PrintBlock[] = [];

  // EN-84: `@media` inside a string is not a rule, and the scan resumes after
  // each print block, so a print block nested in it is not returned again.
  for (let start = 0; start < css.length; start += 1) {
    if (css[start] === '\\') {
      start += 1; // an escaped quote or brace is part of an identifier
      continue;
    }
    if (isQuote(css[start])) {
      start = stringEnd(css, start);
      continue;
    }
    MEDIA_RULE_START.lastIndex = start;
    const match = css[start] === '@' ? MEDIA_RULE_START.exec(css) : null;
    if (!match || !isPrintQuery(match[1])) continue;

    const bodyStart = start + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    for (; cursor < css.length && depth > 0; cursor += 1) {
      if (css[cursor] === '\\') cursor += 1;
      else if (isQuote(css[cursor])) cursor = stringEnd(css, cursor);
      else if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
    }
    if (depth !== 0) {
      const query = match[1].trim().replace(/\s+/g, ' ');
      throw new Error(`The @media ${query} block is not properly closed.`);
    }

    blocks.push({
      before: css.slice(0, start),
      body: css.slice(bodyStart, cursor - 1),
      after: css.slice(cursor),
      end: cursor,
    });
    start = cursor - 1;
  }

  return blocks;
}
