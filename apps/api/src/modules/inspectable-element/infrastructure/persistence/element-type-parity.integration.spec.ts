import { $Enums } from '@prisma/client';
import { elementTypeSchema } from '@sf-manager/validation';
import { ELEMENT_TYPES } from '../../domain/element-type';

// design.md Decision 1: three compile-time gates close the domain/Zod/
// mapper edges of the `ElementType` three-way seam, but none of them can
// catch a *generated-client-out-of-date* mismatch — the type system only
// sees whatever `$Enums.ElementType` the last `prisma generate` produced,
// even if the running database (or a hand-edited schema.prisma) disagrees.
// This runtime parity spec is the proposal's stated mitigation ("a test
// asserts all three agree") and the only gate that catches that case.
// Placed under infrastructure/persistence/** so it may import
// `@prisma/client` without violating ADR-013's `no-restricted-imports` rule.
describe('ElementType three-way parity', () => {
  it('the domain union, the generated Prisma enum and the Zod schema all agree on the same set of values', () => {
    const domainValues = [...ELEMENT_TYPES].sort();
    const prismaValues = Object.values($Enums.ElementType).sort();
    const zodValues = [...elementTypeSchema.options].sort();

    expect(prismaValues).toEqual(domainValues);
    expect(zodValues).toEqual(domainValues);
  });
});
