import { $Enums } from '@prisma/client';
import { reviewFrequencySchema } from '@sf-manager/validation';
import { REVIEW_FREQUENCIES } from '../../domain/review-frequency';

// design.md Decision 1: three compile-time gates close the domain/Zod/
// mapper edges of the `ReviewFrequency` three-way seam, but none of them can
// catch a *generated-client-out-of-date* mismatch — the type system only
// sees whatever `$Enums.ReviewFrequency` the last `prisma generate`
// produced, even if the running database (or a hand-edited schema.prisma)
// disagrees. This runtime parity spec is the mitigation (spec.md "Review
// Frequency Enumeration" — "The three declarations agree") and the only
// gate that catches that case. Placed under infrastructure/persistence/**
// so it may import `@prisma/client` without violating ADR-013's
// `no-restricted-imports` rule. Mirrors
// inspectable-element/infrastructure/persistence/element-type-parity.integration.spec.ts.
describe('ReviewFrequency three-way parity', () => {
  it('the domain union, the generated Prisma enum and the Zod schema all agree on the same set of values', () => {
    const domainValues = [...REVIEW_FREQUENCIES].sort();
    const prismaValues = Object.values($Enums.ReviewFrequency).sort();
    const zodValues = [...reviewFrequencySchema.options].sort();

    expect(prismaValues).toEqual(domainValues);
    expect(zodValues).toEqual(domainValues);
  });
});
