// Machine-readable discriminator for 409 Conflict responses on POST/PATCH/
// DELETE /users (design.md Decision 3, user-management spec delta "409
// responses carry a machine-readable cause"). Additive to the existing
// {statusCode, error, message} body — never replaces `message`. Mirrored as
// a literal union in apps/web/src/api/users.ts (PR 2); kept as honest
// duplication rather than hoisted into @sf-manager/validation until a
// second consumer needs its own codes (design.md "Deferred trigger").
export type UserErrorCode =
  'EMAIL_ALREADY_IN_USE' | 'LAST_SYSTEM_ADMIN' | 'TRANSACTION_CONFLICT';
