// Hand-written string-literal union (ADR-013 — the domain layer has zero
// Prisma dependency), mirroring domain/role.ts exactly. ADR-011 Decision 2's
// literal signature (`User.managerCapabilities: ManagerCapability[]`) names
// six capability slots; this slice declares only the one it implements
// (review-history-manager-capability/design.md Decision 1 — proposal
// non-goal, ADR-006). Prisma's generated `$Enums.ManagerCapability` is
// structurally assignable to this type, so UserMapper needs no cast.
export type ManagerCapability = 'VIEW_ALL_REVIEWS';
