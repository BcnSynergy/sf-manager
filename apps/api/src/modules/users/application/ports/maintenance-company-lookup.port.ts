// Port (application layer, ADR-002/013), owned by `users` — NOT imported
// from the `maintenance-company` module. design.md Decision 4: `users` does
// not own MaintenanceCompany and never writes it; it owns exactly one
// question ("is this company id live?"), and Clean Architecture says the
// consumer owns the contract it needs. This is what keeps the Nest module
// graph acyclic without `forwardRef()` — `MaintenanceCompanyModule` imports
// `UsersModule` for `USER_REPOSITORY` (mirroring `CommunityModule`), while
// `UsersModule` imports nothing from `maintenance-company` at all.
//
// Why a lookup and not a repository: injecting the full
// MAINTENANCE_COMPANY_REPOSITORY would couple `users`' application layer to
// another module's complete port AND re-create the cycle. Two adapters
// touching one table (this one, plus PrismaMaintenanceCompanyRepository in
// Phase 8) is the smaller price for a read-only, single-column existence
// probe. Rule-of-three note (design.md): if a second cross-module liveness
// lookup appears, revisit with a
// `shared/application/ports/entity-liveness.port.ts` generalization — not
// before.
export interface MaintenanceCompanyLookup {
  // True only for a company that exists AND is not soft-deleted (ADR-010).
  // Missing and soft-deleted are indistinguishable — both resolve to false
  // (design.md Decision 5, "Company id references a missing or soft-deleted
  // company" — a single violation shape).
  existsActive(id: string): Promise<boolean>;
}

export const MAINTENANCE_COMPANY_LOOKUP = Symbol('MAINTENANCE_COMPANY_LOOKUP');
