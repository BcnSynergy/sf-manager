import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// EN-62: the browser hides a closed <dialog> with `dialog:not([open]) {
// display: none }`. Any author `display` on `.sf-dialog` itself would beat
// that rule and leave every always-mounted ConfirmDialog visible, so
// `display` may only be set for `.sf-dialog[open]`. jsdom applies no
// index.css, so this reads the source, as index-css-print-credit.test.ts
// does (EN-50).
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

type Rule = { selectors: string[]; body: string };

function rules(source: string): Rule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim()),
    body: match[2] ?? '',
  }));
}

// True when the selector's subject is the dialog element itself in its
// closed-or-open state, i.e. it ends in `.sf-dialog` with no `[open]`.
function targetsClosedDialog(selector: string): boolean {
  return /\.sf-dialog$/.test(selector);
}

describe('index.css ConfirmDialog rules', () => {
  it('sets no display on .sf-dialog outside the [open] state', () => {
    const offending = rules(css).filter(
      (rule) => rule.selectors.some(targetsClosedDialog) && /(^|;|\s)display\s*:/.test(rule.body),
    );
    expect(offending).toEqual([]);
  });

  it('lays the open dialog out as a grid', () => {
    const open = rules(css).find((rule) => rule.selectors.includes('.sf-dialog[open]'));
    expect(open?.body).toMatch(/display:\s*grid/);
  });
});
