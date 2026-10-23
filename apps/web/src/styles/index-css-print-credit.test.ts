import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { printBlocks } from './print-blocks';

// web-visual-foundation spec "The Maker Credit Appears on Screen Only": the
// credit MUST NOT appear in printed output. Read from disk via process.cwd()
// for the reason given in check-app-nav-print-suppression.test.ts (EN-50).
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

const blocks = printBlocks(css);

describe('index.css print rules', () => {
  const hidesCredit = /\.sf-credit\s*{\s*display:\s*none;?\s*}/;

  it('hides the maker credit in print', () => {
    expect(blocks.some((block) => hidesCredit.test(block.body))).toBe(true);
  });

  it('declares no .sf-credit rule after the print block that could override it', () => {
    const hiding = blocks.filter((block) => hidesCredit.test(block.body));
    expect(hiding.at(-1)?.after).not.toMatch(/\.sf-credit/);
  });
});
