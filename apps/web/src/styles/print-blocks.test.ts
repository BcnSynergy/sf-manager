import { describe, expect, it } from 'vitest';
import { printBlocks, topLevelStyleRules } from './print-blocks';

// EN-81: the print CSS tests read the stylesheet through this helper, so it
// is triangulated against synthetic fixtures independent of index.css.
describe('printBlocks', () => {
  it('returns no blocks when the stylesheet has no @media print', () => {
    expect(printBlocks('.a { color: red; }')).toEqual([]);
  });

  it('returns the body of a single print block', () => {
    const [block] = printBlocks('.a { color: red; } @media print { .b { display: none; } } .c {}');

    expect(block.body).toBe(' .b { display: none; } ');
  });

  it('returns every print block, in source order', () => {
    const blocks = printBlocks(
      '@media print { .a { display: none; } } .b {} @media print { .c { margin: 0; } }',
    );

    expect(blocks.map((block) => block.body.trim())).toEqual([
      '.a { display: none; }',
      '.c { margin: 0; }',
    ]);
  });

  it('ignores braces and @media print inside comments', () => {
    const blocks = printBlocks(
      '/* @media print { */ .a {} @media print { /* } */ .b { display: none; } } .c {}',
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].body.trim()).toBe('.b { display: none; }');
  });

  it('keeps nested rules inside the block', () => {
    const [block] = printBlocks('@media print { @page { margin: 1cm; } .a { color: black; } }');

    expect(block.body).toContain('@page { margin: 1cm; }');
    expect(block.body).toContain('.a { color: black; }');
  });

  it('gives the text after each block, without comments', () => {
    const [first, second] = printBlocks(
      '@media print { .a {} } /* .x */ .b {} @media print { .c {} } .d {}',
    );

    expect(first.after).toBe('  .b {} @media print { .c {} } .d {}');
    expect(second.after).toBe(' .d {}');
  });

  // EN-83: every media query list with a `print` media type is a print block.
  it.each([
    '@media print and (min-width: 0)',
    '@media only print',
    '@media screen, print',
    '@media PRINT',
  ])('reads "%s" as a print block', (query) => {
    const [block] = printBlocks(`.a {} ${query} { .b { display: none; } } .c {}`);

    expect(block?.body.trim()).toBe('.b { display: none; }');
  });

  it.each(['@media not print', '@media screen', '@media (max-width: 640px)', '@media printer'])(
    'does not read "%s" as a print block',
    (query) => {
      expect(printBlocks(`${query} { .b { display: none; } }`)).toEqual([]);
    },
  );

  it('keeps comment markers inside strings', () => {
    const [block] = printBlocks(
      `@media print { .a::before { content: "/*"; } .b { display: none; } } /* x */ .c { content: '*/'; }`,
    );

    expect(block.body.trim()).toBe('.a::before { content: "/*"; } .b { display: none; }');
    expect(block.after).toBe("  .c { content: '*/'; }");
  });

  it('keeps an escaped quote inside a string', () => {
    const [block] = printBlocks(
      `@media print { .a::before { content: "\\" /*"; } } .b { content: "*/"; }`,
    );

    expect(block.body.trim()).toBe('.a::before { content: "\\" /*"; }');
  });

  it('ignores braces inside strings', () => {
    const [block] = printBlocks(`@media print { .a::before { content: "}"; } } .b {}`);

    expect(block.body.trim()).toBe('.a::before { content: "}"; }');
    expect(block.after).toBe(' .b {}');
  });

  it('gives the text before each block, without comments', () => {
    const [first, second] = printBlocks(
      '.a {} /* .x */ @media print { .b {} } .c {} @media print { .d {} }',
    );

    expect(first.before).toBe('.a {}  ');
    expect(second.before).toBe('.a {}  @media print { .b {} } .c {} ');
    expect(first.end).toBe('.a {}  @media print { .b {} }'.length);
  });

  // EN-84: strings, nesting and the unclosed-block message.
  it('ignores @media print inside a string', () => {
    expect(printBlocks('.a::before { content: "@media print {"; } .b {}')).toEqual([]);
  });

  it('returns a print block nested in another print block once', () => {
    const blocks = printBlocks('@media print { @media print { .a {} } .b {} } .c {}');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].body.trim()).toBe('@media print { .a {} } .b {}');
  });

  it('ends an unterminated string at the newline, as CSS does', () => {
    const [block] = printBlocks('@media print { .a { content: "x\n} .b { display: none; } } .c {}');

    expect(block.body).toBe(' .a { content: "x\n} .b { display: none; } ');
    expect(block.after).toBe(' .c {}');
    expect(printBlocks('.a { content: "x\n} /* @media print { */ .c {}')).toEqual([]);
  });

  it.each(['\r', '\f'])('ends an unterminated string at a %j line break too', (lineBreak) => {
    const [block] = printBlocks(`.a { content: "x${lineBreak}} @media print { .b {} }`);

    expect(block?.body).toBe(' .b {} ');
  });

  it('does not take an escaped quote or brace in a selector as a string or brace', () => {
    const [block] = printBlocks('.a\\"b {} @media print { .c\\{d { display: none; } } .e {}');

    expect(block?.body).toBe(' .c\\{d { display: none; } ');
    expect(block?.after).toBe(' .e {}');
  });

  it('collapses a multi-line query in the unclosed-block message', () => {
    expect(() => printBlocks('@media screen,\n  print { .a {}')).toThrow(
      'The @media screen, print block is not properly closed.',
    );
  });

  it('continues a string after an escaped CRLF line break', () => {
    expect(printBlocks('.a { content: "x\\\r\n@media print { y"; } .b {}')).toEqual([]);
  });

  it('names the media query of an unclosed print block', () => {
    expect(() => printBlocks('@media screen, print { .a {}')).toThrow(
      'The @media screen, print block is not properly closed.',
    );
  });

  it('fails loudly on an unclosed print block', () => {
    expect(() => printBlocks('@media print { .a { display: none; }')).toThrow(
      /not properly closed/,
    );
  });

  // EN-87: whether a block applies whenever the page prints.
  it.each([
    ['@media print { .a {} }', true],
    ['@media only print { .a {} }', true],
    ['@media screen, PRINT { .a {} }', true],
    ['@media print and (orientation: landscape) { .a {} }', false],
    ['@media screen { @media print { .a {} } }', false],
    ['.x { @media print { .a {} } }', false],
    ['.x { content: "{"; } @media print { .a {} }', true],
  ])('tells whether "%s" always applies in print', (css, alwaysApplies) => {
    expect(printBlocks(css).map((block) => block.alwaysApplies)).toEqual([alwaysApplies]);
  });
});

// EN-89: the check reads the rules at a print block's own level.
describe('topLevelStyleRules', () => {
  it('returns the top-level style rules, skipping at-rules and what they nest', () => {
    const css = ' .a { x } @supports (y) { .b { z } } .c, .d { w } ';

    expect(topLevelStyleRules(css)).toEqual([
      { prelude: ' .a ', body: ' x ', end: ' .a { x }'.length },
      { prelude: ' .c, .d ', body: ' w ', end: css.length - 1 },
    ]);
  });

  it('starts a prelude after a statement at-rule', () => {
    expect(topLevelStyleRules('@import "x.css"; .a {}').map((rule) => rule.prelude)).toEqual([
      ' .a ',
    ]);
  });

  it('ignores braces inside strings and escaped braces', () => {
    const css = '.a { content: "}"; } .b\\{c { x }';

    expect(topLevelStyleRules(css).map((rule) => rule.prelude)).toEqual(['.a ', ' .b\\{c ']);
  });
});
