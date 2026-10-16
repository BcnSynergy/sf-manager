import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// web-visual-foundation spec "The Maker Credit Appears on Screen Only": the
// credit MUST NOT appear in printed output. Read from disk via process.cwd()
// for the reason given in check-app-nav-print-suppression.test.ts (EN-50).
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

function printBlock(source: string): string {
  const start = source.search(/@media\s+print\s*{/);
  if (start === -1) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

describe('index.css print rules', () => {
  it('hides the maker credit in print', () => {
    expect(printBlock(css)).toMatch(/\.sf-credit\s*{\s*display:\s*none;?\s*}/);
  });

  it('declares no .sf-credit rule after the print block that could override it', () => {
    const block = printBlock(css);
    const after = css.slice(css.indexOf(block) + block.length);
    expect(after).not.toMatch(/\.sf-credit/);
  });
});
