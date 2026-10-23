import { describe, expect, it } from 'vitest';
import { printBlocks } from './print-blocks';

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
  });

  it('fails loudly on an unclosed print block', () => {
    expect(() => printBlocks('@media print { .a { display: none; }')).toThrow(
      /not properly closed/,
    );
  });
});
