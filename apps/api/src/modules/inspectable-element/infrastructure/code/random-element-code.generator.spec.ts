import { ELEMENT_CODE_ALPHABET } from '../../domain/element-code';
import { RandomElementCodeGenerator } from './random-element-code.generator';

// design.md Decision 3: `crypto.randomInt` per character, rejection-sampled
// and unbiased (unlike `randomBytes` + `% 31`, rejected in the design for
// measurable modulo bias). A 10,000-sample large-N check is the only way to
// pin "every character drawn from the alphabet, no ambiguous chars, no
// systematic exclusion" without asserting on internal implementation.
const SAMPLE_SIZE = 10_000;
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{10}$/;

describe('RandomElementCodeGenerator', () => {
  const generator = new RandomElementCodeGenerator();
  const codes = Array.from({ length: SAMPLE_SIZE }, () => generator.generate());

  it('generates codes of exactly ELEMENT_CODE_LENGTH characters', () => {
    for (const code of codes) {
      expect(code).toHaveLength(10);
    }
  });

  it('draws every character exclusively from ELEMENT_CODE_ALPHABET', () => {
    for (const code of codes) {
      for (const char of code) {
        expect(ELEMENT_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('never emits the visually-ambiguous characters 0, O, 1, I, L', () => {
    for (const code of codes) {
      expect(code).toMatch(CODE_PATTERN);
    }
  });

  it('produces distinct codes across a 10,000-sample run', () => {
    const distinct = new Set(codes);

    expect(distinct.size).toBe(SAMPLE_SIZE);
  });
});
