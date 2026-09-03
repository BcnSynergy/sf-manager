import { $Enums } from '@prisma/client';
import { reviewTemplateStatusSchema } from '@sf-manager/validation';
import { REVIEW_TEMPLATE_STATUSES } from '../../domain/review-template-status';

// design.md Decision 1 (checklist-management/design.md, Findings #4):
// `ReviewTemplateStatus` is the fourth closed-catalog three-way seam in
// this change, mirroring `checklist-question`'s
// review-frequency-parity.integration.spec.ts exactly. Compile-time gates
// (the `satisfies` constraint on `review-template-status.ts`) close the
// domain/Zod edges, but none of them catch a *generated-client-out-of-date*
// mismatch — the type system only sees whatever `$Enums.ReviewTemplateStatus`
// the last `prisma generate` produced, even if the running database
// disagrees. This runtime parity spec is the mitigation (spec.md "The three
// declarations agree"). Placed under infrastructure/persistence/** so it
// may import `@prisma/client` without violating ADR-013's
// `no-restricted-imports` rule.
describe('ReviewTemplateStatus three-way parity', () => {
  it('the domain union, the generated Prisma enum and the Zod schema all agree on the same set of values', () => {
    const domainValues = [...REVIEW_TEMPLATE_STATUSES].sort();
    const prismaValues = Object.values($Enums.ReviewTemplateStatus).sort();
    const zodValues = [...reviewTemplateStatusSchema.options].sort();

    expect(prismaValues).toEqual(domainValues);
    expect(zodValues).toEqual(domainValues);
  });
});
