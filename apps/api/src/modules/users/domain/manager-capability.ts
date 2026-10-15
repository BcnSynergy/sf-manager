// Hand-written string-literal union (ADR-013 — the domain layer has zero
// Prisma dependency), mirroring domain/role.ts exactly. ADR-011 Decision 2's
// literal signature (`User.managerCapabilities: ManagerCapability[]`) names
// six capability slots; this slice declares only the one it implements
// (review-history-manager-capability/design.md Decision 1 — proposal
// non-goal, ADR-006). Prisma's generated `$Enums.ManagerCapability` is
// structurally assignable to this type, so UserMapper needs no cast.
export type ManagerCapability = 'VIEW_ALL_REVIEWS';

// EN-45: every ManagerCapability, for runtime lists such as the OpenAPI enum.
// Keyed by the union, so a new member fails to compile until it is listed.
const MANAGER_CAPABILITY_KEYS: Record<ManagerCapability, true> = {
  VIEW_ALL_REVIEWS: true,
};
export const MANAGER_CAPABILITIES = Object.keys(
  MANAGER_CAPABILITY_KEYS,
) as readonly ManagerCapability[];

// TD-12: MANAGER scope (review schedule and review history) is granted on
// VIEW_ALL_REVIEWS alone, which is only right while it is the sole member.
// This type becomes `never` once the union gains, renames or loses a member,
// so each call site that types its capability with it fails to compile
// until that scope logic is revisited. Generic so the spec can prove the
// collapse with probe unions.
export type SoleCapability<U> = [U] extends ['VIEW_ALL_REVIEWS'] ? U : never;
export type SoleManagerCapability = SoleCapability<ManagerCapability>;
