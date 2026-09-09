// Port (application layer, ADR-002/013), owned by its consumer
// (`review-session`) — mirrors the `MaintenanceCompanyLookup` precedent
// (`users/application/ports/maintenance-company-lookup.port.ts`): a narrow,
// module-local cross-module read, NOT a shared authorization port.
//
// review-history-company-scope/design.md Decision 5: deliberately separate
// from `CompanyScopeChecker` (shared/application/authorization) — that port
// is role-dispatched and fail-closed; this one is role-agnostic and reads a
// plain data fact, never a grant. Merging them would put a security-critical
// contract on a general-purpose lookup.
//
// This first slice (Phase 1) adds ONLY the write-path half —
// `findMaintenanceCompanyId`, consumed by `OpenReviewSessionUseCase`
// (Decision 1). The read-path half, `findEmailsByIds` (Decision 5,
// deliberately soft-delete-INCLUSIVE), is Phase 3's — added when
// `ListReviewHistoryUseCase`/`ReadReviewHistoryUseCase` need it.
export interface UserDirectory {
  // The performer's CURRENT maintenance company at the moment this is
  // called — role-agnostic on purpose, this is a data fact, not a grant.
  // Null when the user has no maintenance company (a legitimate, permanent
  // state — see review-session domain design.md Decision 1).
  findMaintenanceCompanyId(userId: string): Promise<string | null>;
}

export const USER_DIRECTORY = Symbol('USER_DIRECTORY');
