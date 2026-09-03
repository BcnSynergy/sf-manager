import { REVIEW_FREQUENCIES, ReviewFrequency } from './review-frequency';

// design.md Decision 1: REVIEW_FREQUENCIES is the authoritative TypeScript
// union of review frequencies — the Postgres enum (schema.prisma, PR 1) and
// the Zod schema (packages/validation, Phase 3) are each a separate
// projection of this same set of values. Purely structural (const array +
// derived union type, no branching, no logic) — triangulation skipped per
// strict-tdd.md ("purely structural... literally ONE possible output").
// Mirrors inspectable-element/domain/element-type.spec.ts.
describe('REVIEW_FREQUENCIES', () => {
  it('declares exactly MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL', () => {
    expect(REVIEW_FREQUENCIES).toEqual([
      'MONTHLY',
      'QUARTERLY',
      'SEMIANNUAL',
      'ANNUAL',
    ]);
  });

  it('is usable as the ReviewFrequency union at the type level', () => {
    const value: ReviewFrequency = 'QUARTERLY';

    expect(REVIEW_FREQUENCIES).toContain(value);
  });
});
