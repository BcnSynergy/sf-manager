import {
  REVIEW_SESSION_STATUSES,
  ReviewSessionStatus,
} from './review-session-status';

// design.md Decision 9: REVIEW_SESSION_STATUSES is the authoritative
// TypeScript union of review-session statuses — the Postgres enum
// (schema.prisma) and the Zod schema (packages/validation, Phase 5) are each
// a separate projection of this same set of values. Purely structural (const
// array + derived union type, no branching, no logic) — triangulation
// skipped per strict-tdd.md ("purely structural... literally ONE possible
// output"), mirroring inspectable-element/domain/element-type.spec.ts.
describe('REVIEW_SESSION_STATUSES', () => {
  it('declares draft and completed only — signed is NOT declared (Decision 8)', () => {
    expect(REVIEW_SESSION_STATUSES).toEqual(['draft', 'completed']);
  });

  it('is usable as the ReviewSessionStatus union at the type level', () => {
    const value: ReviewSessionStatus = 'draft';

    expect(REVIEW_SESSION_STATUSES).toContain(value);
  });
});
