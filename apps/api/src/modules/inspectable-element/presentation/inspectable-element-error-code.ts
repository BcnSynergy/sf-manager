// Machine-readable discriminator for the two 404 Not Found causes reachable
// on `.../inspectable-elements/:elementId` (design.md Decision 7): the edit
// page cannot tell "this community is gone" from "this element is gone"
// without a code, and those need different copy. Both are 404s on the same
// call, which is exactly the coded-error convention's earning test (design.md
// Decision 7). Additive to the existing {statusCode, error, message} body
// via buildCodedError — never replaces `message`. Mirrored as a literal
// union in apps/web/src/api/inspectable-element.ts (Phase 7); kept as a
// local copy per the coded-error convention rather than hoisted into
// @sf-manager/validation.
// uuid-path-validation branch: INVALID_ELEMENT_ID and INVALID_COMMUNITY_ID
// are the coded 400s for a malformed `:elementId` / `:communityId`, both
// built via the shared uuidParamPipe() factory — same convention as
// INVALID_SESSION_ID (review-session-error-code.ts). The e2e fixtures in
// this module's own spec were migrated to well-formed UUIDs so
// `:communityId` validation could be added here (see
// inspectable-element.e2e-spec.ts); community.e2e-spec.ts's calls into
// these routes already used real, app-generated UUIDs.
export type InspectableElementErrorCode =
  | 'COMMUNITY_NOT_FOUND'
  | 'INSPECTABLE_ELEMENT_NOT_FOUND'
  | 'INVALID_ELEMENT_ID'
  | 'INVALID_COMMUNITY_ID';
