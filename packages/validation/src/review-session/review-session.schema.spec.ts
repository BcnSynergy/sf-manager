import { describe, expect, it } from 'vitest';
import { recordEntryRequestSchema } from './review-session.schema';

// review-session/design.md Decision 1: an entry-write body MUST be exactly
// ONE of `{ answers: [...] }` or `{ observations: string }` — never both,
// never neither. No literal discriminator field exists in either branch
// (Decision 1 deliberately rejected adding one), so this is a `z.union` of
// two `.strict()` schemas rather than `z.discriminatedUnion` — this spec is
// what proves the XOR still holds without the discriminator.
describe('recordEntryRequestSchema — answers XOR observations', () => {
  it('accepts a body carrying only answers', () => {
    const result = recordEntryRequestSchema.safeParse({
      answers: [{ questionId: 'question-1', value: 'YES' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a body carrying only observations', () => {
    const result = recordEntryRequestSchema.safeParse({
      observations: 'sealed room, no access',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body carrying both answers and observations', () => {
    const result = recordEntryRequestSchema.safeParse({
      answers: [{ questionId: 'question-1', value: 'YES' }],
      observations: 'sealed room, no access',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a body carrying neither key', () => {
    const result = recordEntryRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a blank observations reason', () => {
    const result = recordEntryRequestSchema.safeParse({ observations: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty answers array', () => {
    const result = recordEntryRequestSchema.safeParse({ answers: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an answer value outside YES/NO/NOT_APPLICABLE', () => {
    const result = recordEntryRequestSchema.safeParse({
      answers: [{ questionId: 'question-1', value: 'MAYBE' }],
    });
    expect(result.success).toBe(false);
  });
});
