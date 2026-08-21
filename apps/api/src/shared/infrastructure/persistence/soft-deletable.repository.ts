// Base class (ADR-010): enforces the `deletedAt: null` default filter for
// every repository that extends it, so soft-deleted rows are excluded by
// construction instead of being reimplemented (and possibly forgotten) in
// each module's Prisma repository. Exempt from the ADR-013 `@prisma/client`
// import restriction (infrastructure/persistence/** — see eslint.config.mjs)
// even though this base class itself stays framework/Prisma-agnostic.
export abstract class SoftDeletableRepository {
  protected withDefaultFilter<TWhere extends Record<string, unknown>>(
    where: TWhere,
  ): Omit<TWhere, 'deletedAt'> & { deletedAt: null } {
    return { ...where, deletedAt: null };
  }
}
