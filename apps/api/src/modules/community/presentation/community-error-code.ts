// Machine-readable discriminator for 409 Conflict responses on the
// assignment routes (POST assign representative/technician, `reactivate`
// representative/technician) — design.md Decision 1, community-assignments
// spec delta "Assignment 409 Error Codes". Additive to the existing
// {statusCode, error, message} body — never replaces `message`. Mirrored as
// a literal union in apps/web/src/api/community.ts (PR 2); kept as a local
// copy per the Coded-conflict convention (design.md Decision 1) rather than
// hoisted into @sf-manager/validation, since the union shares no values with
// `UserErrorCode` except `TRANSACTION_CONFLICT`.
// inspectable-elements/design.md Decision 6/7: DELETE /communities/:id
// gains a third 409 cause, COMMUNITY_HAS_ACTIVE_ELEMENTS, when the atomic
// delete guard refuses. Mirrored in apps/web/src/api/community.ts (tasks.md
// 3.12).
// uuid-path-validation branch: INVALID_COMMUNITY_ID and INVALID_USER_ID
// are the coded 400s for a malformed `:id` / `:userId`, both built via the
// shared uuidParamPipe() factory — same convention as INVALID_ELEMENT_ID
// (inspectable-element-error-code.ts) and INVALID_USER_ID
// (user-error-code.ts).
export type CommunityErrorCode =
  | 'ASSIGNMENT_ALREADY_EXISTS'
  | 'INELIGIBLE_ROLE'
  | 'TRANSACTION_CONFLICT'
  | 'COMMUNITY_HAS_ACTIVE_ELEMENTS'
  | 'INVALID_COMMUNITY_ID'
  | 'INVALID_USER_ID';
