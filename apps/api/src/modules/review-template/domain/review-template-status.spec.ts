import {
  REVIEW_TEMPLATE_STATUSES,
  ReviewTemplateStatus,
} from './review-template-status';

// design.md Decision 1: REVIEW_TEMPLATE_STATUSES is the authoritative
// TypeScript union of review template statuses — the Postgres enum
// (`enum ReviewTemplateStatus`, schema.prisma, PR 6) and the Zod schema
// (`reviewTemplateStatusSchema`, packages/validation, Phase 8) are each a
// separate projection of this same set of values. Purely structural (const
// array + derived union type, no branching, no logic) — triangulation
// skipped per strict-tdd.md ("purely structural... literally ONE possible
// output"). Mirrors checklist-question/domain/review-frequency.spec.ts.
describe('REVIEW_TEMPLATE_STATUSES', () => {
  it('declares exactly draft, active, retired', () => {
    expect(REVIEW_TEMPLATE_STATUSES).toEqual(['draft', 'active', 'retired']);
  });

  it('is usable as the ReviewTemplateStatus union at the type level', () => {
    const value: ReviewTemplateStatus = 'active';

    expect(REVIEW_TEMPLATE_STATUSES).toContain(value);
  });
});
