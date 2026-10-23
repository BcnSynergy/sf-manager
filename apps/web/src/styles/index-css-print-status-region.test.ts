import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { printBlocks } from './print-blocks';

// EN-76: on screen an empty StatusRegion cancels one flex gap with a negative
// top margin. Print lays `main` out as a block, with no gap to cancel, so the
// margin must go or the content after the region moves up. Read from disk via
// process.cwd() for the reason given in check-app-nav-print-suppression.test.ts.
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

describe('index.css print rules for the status region', () => {
  it('drops the empty status region negative margin in print', () => {
    const resetsMargin = /\.sf-status-region:empty\s*{\s*margin-block-start:\s*0;?\s*}/;
    expect(printBlocks(css).some((block) => resetsMargin.test(block.body))).toBe(true);
  });
});
