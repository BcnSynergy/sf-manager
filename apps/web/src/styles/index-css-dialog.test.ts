import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// EN-62: the browser hides a closed <dialog> with `dialog:not([open]) {
// display: none }`. Any author `display` that can match a closed
// `.sf-dialog` would beat that rule and leave every always-mounted
// ConfirmDialog visible, so `display` may only be set for `.sf-dialog[open]`.
// jsdom applies no index.css, so this reads the source, as
// index-css-print-credit.test.ts does (EN-50).
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

type Rule = { selectors: string[]; body: string };

function rules(source: string): Rule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim()),
    body: match[2] ?? '',
  }));
}

// True when the selector's subject (its last compound) is a `.sf-dialog`
// that can be closed: not a pseudo-element such as ::backdrop, and not
// limited to `[open]` (an `[open]` inside `:not(...)` still matches a
// closed dialog).
function canMatchClosedDialog(selector: string): boolean {
  const subject = selector.split(/\s*[\s>+~]\s*/).pop() ?? '';
  if (!/\.sf-dialog(?![\w-])/.test(subject) || subject.includes('::')) {
    return false;
  }
  return !subject.replace(/:not\([^)]*\)/g, '').includes('[open]');
}

function setsDisplay(body: string): boolean {
  return /(^|;|\s)display\s*:/i.test(body);
}

describe('index.css ConfirmDialog rules', () => {
  it.each([
    ['.sf-dialog', true],
    ['dialog.sf-dialog', true],
    ['.app .sf-dialog', true],
    ['.sf-dialog.wide', true],
    ['.sf-dialog:not([open])', true],
    ['.sf-dialog:where(.x)', true],
    ['.sf-dialog[open]', false],
    ['.sf-dialog::backdrop', false],
    ['.sf-dialog-title', false],
    ['.sf-dialog p', false],
    ['.sf-dialog .sf-actions', false],
  ])('treats %s as able to match a closed dialog: %s', (selector, expected) => {
    expect(canMatchClosedDialog(selector)).toBe(expected);
  });

  it('detects display declarations in any letter case', () => {
    expect(setsDisplay('  display: grid;')).toBe(true);
    expect(setsDisplay('color: red; DISPLAY: block')).toBe(true);
    expect(setsDisplay('  grid-display-x: 1;')).toBe(false);
  });

  it('sets no display on a .sf-dialog that can be closed', () => {
    const offending = rules(css).filter(
      (rule) => rule.selectors.some(canMatchClosedDialog) && setsDisplay(rule.body),
    );
    expect(offending).toEqual([]);
  });

  it('lays the open dialog out as a grid', () => {
    const open = rules(css).find((rule) => rule.selectors.includes('.sf-dialog[open]'));
    expect(open?.body).toMatch(/display:\s*grid/);
  });
});
