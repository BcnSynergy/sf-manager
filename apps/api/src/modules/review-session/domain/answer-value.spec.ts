import { ANSWER_VALUES, AnswerValue } from './answer-value';

// design.md Decision 9: ANSWER_VALUES is the authoritative TypeScript union
// of question-answer values — the Postgres enum (schema.prisma) and the Zod
// schema (packages/validation, Phase 5) are each a separate projection of
// this same set of values. Purely structural — triangulation skipped per
// strict-tdd.md, mirroring review-session-status.spec.ts.
describe('ANSWER_VALUES', () => {
  it('declares YES, NO and NOT_APPLICABLE', () => {
    expect(ANSWER_VALUES).toEqual(['YES', 'NO', 'NOT_APPLICABLE']);
  });

  it('is usable as the AnswerValue union at the type level', () => {
    const value: AnswerValue = 'NOT_APPLICABLE';

    expect(ANSWER_VALUES).toContain(value);
  });
});
