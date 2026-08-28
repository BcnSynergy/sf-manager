// Machine-readable discriminator for the two 409 Conflict causes on the
// /maintenance-companies routes (design.md Decision 1/6, Routes table).
// Additive to the existing {statusCode, error, message} body via the shared
// buildCodedError — never replaces `message`. Mirrored as a literal union in
// apps/web/src/api/maintenance-company.ts (PR 9); kept as a local copy per
// the coded-error convention rather than hoisted into @sf-manager/validation
// (design.md Decision 1). TRANSACTION_CONFLICT is deliberately absent — this
// module has no transactional() seam, so there is no P2034 path (design.md
// Decision 6, "Findings reported to the proposal").
export type MaintenanceCompanyErrorCode =
  | 'TAX_ID_ALREADY_IN_USE'
  | 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS';
