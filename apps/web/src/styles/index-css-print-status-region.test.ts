import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// EN-76: on screen an empty StatusRegion cancels one flex gap with a negative
// top margin. Print lays `main` out as a block, with no gap to cancel, so the
// margin must go or the content after the region moves up. Read from disk via
// process.cwd() for the reason given in check-app-nav-print-suppression.test.ts.
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

describe('index.css print rules for the status region', () => {
  it('drops the empty status region negative margin in print', () => {
    expect(printBlock(css)).toMatch(/\.sf-status-region:empty\s*{\s*margin-block-start:\s*0;?\s*}/);
  });
});
