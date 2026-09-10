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
// Phase 1 added the write-path half — `findMaintenanceCompanyId`, consumed
// by `OpenReviewSessionUseCase` (Decision 1). Phase 3 (this) adds the
// read-path half, `findEmailsByIds` — Decision 5, deliberately
// soft-delete-INCLUSIVE, consumed by `ListReviewHistoryUseCase`/
// `ReadReviewHistoryUseCase`.
export interface UserDirectory {
  // The performer's CURRENT maintenance company at the moment this is
  // called — role-agnostic on purpose, this is a data fact, not a grant.
  // Null when the user has no maintenance company (a legitimate, permanent
  // state — see review-session domain design.md Decision 1).
  findMaintenanceCompanyId(userId: string): Promise<string | null>;

  // Display-only emails for a set of performer ids, resolved with ONE
  // batched query for the whole result set (design.md Decision 8's "one
  // query, not N" — a company-wide list can span many technicians).
  // DELIBERATELY includes soft-deleted users (ADR-010's default filter is
  // the wrong default here — a manager's whole purpose is reading sessions
  // performed by technicians who have since left). An id with no matching
  // user is simply absent from the returned map — callers fall back to a
  // localized placeholder / `''`, mirroring how `communityNameById` in
  // `list-review-history.use-case.ts` already handles an unresolved id.
  findEmailsByIds(userIds: readonly string[]): Promise<Map<string, string>>;
}

export const USER_DIRECTORY = Symbol('USER_DIRECTORY');
