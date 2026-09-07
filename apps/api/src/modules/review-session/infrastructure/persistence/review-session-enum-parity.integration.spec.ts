import { $Enums } from '@prisma/client';
import { answerValueSchema, reviewSessionStatusSchema } from '@sf-manager/validation';
import { REVIEW_SESSION_STATUSES } from '../../domain/review-session-status';
import { ANSWER_VALUES } from '../../domain/answer-value';

// design.md Decision 9 (Phase 4, task 4.13): ReviewSessionStatus and
// AnswerValue are the two review-session three-way seams, mirroring
// review-template-status-parity.integration.spec.ts exactly. Compile-time
// `satisfies` gates close the domain/Zod edges, but neither catches a
// generated-client-out-of-date mismatch — the type system only sees
// whatever `$Enums` the last `prisma generate` produced, even if the
// running database disagrees. This runtime parity spec is the mitigation.
// Placed under infrastructure/persistence/** so it may import
// `@prisma/client` without violating ADR-013's `no-restricted-imports`
// rule.
describe('ReviewSessionStatus/AnswerValue three-way parity', () => {
  it('ReviewSessionStatus: the domain union, the generated Prisma enum and the Zod schema all agree', () => {
    const domainValues = [...REVIEW_SESSION_STATUSES].sort();
    const prismaValues = Object.values($Enums.ReviewSessionStatus).sort();
    const zodValues = [...reviewSessionStatusSchema.options].sort();

    expect(prismaValues).toEqual(domainValues);
    expect(zodValues).toEqual(domainValues);
  });

  it('AnswerValue: the domain union, the generated Prisma enum and the Zod schema all agree', () => {
    const domainValues = [...ANSWER_VALUES].sort();
    const prismaValues = Object.values($Enums.AnswerValue).sort();
    const zodValues = [...answerValueSchema.options].sort();

    expect(prismaValues).toEqual(domainValues);
    expect(zodValues).toEqual(domainValues);
  });
});
