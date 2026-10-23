import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { printBlocks } from './print-blocks';

// web-visual-foundation spec "The Maker Credit Appears on Screen Only": the
// credit MUST NOT appear in printed output. Read from disk via process.cwd()
// for the reason given in check-app-nav-print-suppression.test.ts (EN-50).
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

const hidesCredit = /\.sf-credit\s*{\s*display:\s*none;?\s*}/;

function blocksHidingCredit() {
  return printBlocks(css).filter((block) => hidesCredit.test(block.body));
}

describe('index.css print rules', () => {
  it('hides the maker credit in print', () => {
    expect(blocksHidingCredit()).not.toHaveLength(0);
  });

  it('declares no .sf-credit rule after the print block that could override it', () => {
    const hiding = blocksHidingCredit();
    expect(hiding).not.toHaveLength(0);
    expect(hiding.at(-1)?.after).not.toMatch(/\.sf-credit/);
  });
});
