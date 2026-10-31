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
    // Every empty region, not only `main > ...` (TD-43): not after `>` nor
    // inside a longer selector.
    const resetsMargin =
      /(?<!>\s*)(?<![\w-])\.sf-status-region:empty\s*{\s*margin-block-start:\s*0;?\s*}/;
    expect(printBlocks(css).filter((block) => resetsMargin.test(block.body))).not.toHaveLength(0);
  });
});

// TD-43: a negative margin cancels a gap only in main's flex column. In a grid
// (`.sf-form`, `.sf-panel`) the empty region still takes a row and adds a
// gap, on screen and in print. Positioned out of flow while empty, it takes
// no row; it stays rendered, so screen readers keep tracking the live region.
describe('index.css status region inside a grid container', () => {
  const selector =
    /:is\(\s*\.sf-form\s*,\s*\.sf-panel\s*\)\s*>\s*\.sf-status-region:empty\s*{([^}]*)}/;

  it('takes an empty status region in a form or panel out of the grid flow', () => {
    const rule = selector.exec(css);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toMatch(/position:\s*absolute/);
    expect(rule?.[1]).toMatch(/margin:\s*0/);
    expect(rule?.[1]).not.toMatch(/display:/);
  });

  it('applies that rule on screen and in print, outside any @media block', () => {
    const at = selector.exec(css)?.index ?? -1;
    const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '');
    const depth = (before.match(/{/g) ?? []).length - (before.match(/}/g) ?? []).length;
    expect(at).toBeGreaterThan(-1);
    expect(depth).toBe(0);
  });
});
