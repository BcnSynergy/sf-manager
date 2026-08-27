// Machine-readable discriminator for 409/400 responses on POST/PATCH/
// DELETE /users (design.md Decision 3, user-management spec delta "409
// responses carry a machine-readable cause"). Additive to the existing
// {statusCode, error, message} body — never replaces `message`. Mirrored as
// a literal union in apps/web/src/api/users.ts (Phase 11); kept as honest
// duplication rather than hoisted into @sf-manager/validation until a
// second consumer needs its own codes (design.md "Deferred trigger").
//
// maintenance-company user-management spec.md "Last-Admin Lockout"
// (MODIFIED): the three MAINTENANCE_COMPANY_* values are 400s, not 409s —
// see design.md Decision 5 for why (a request referencing a live-but-wrong
// company/role pairing, not a state conflict).
export type UserErrorCode =
  | 'EMAIL_ALREADY_IN_USE'
  | 'LAST_SYSTEM_ADMIN'
  | 'TRANSACTION_CONFLICT'
  | 'MAINTENANCE_COMPANY_REQUIRED'
  | 'MAINTENANCE_COMPANY_NOT_ALLOWED'
  | 'MAINTENANCE_COMPANY_NOT_FOUND';
