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
// uuid-path-validation branch: INVALID_ELEMENT_ID is the coded 400 for a
// malformed `:elementId`, built via the shared uuidParamPipe() factory —
// same convention as INVALID_SESSION_ID (review-session-error-code.ts).
// `:communityId` on this controller is deliberately left unvalidated here
// (deferred) — many e2e fixtures across this suite and
// community.e2e-spec.ts seed communities directly with human-readable
// non-UUID ids used as real, successful path targets (e.g. the
// SYSTEM_ADMIN-permitted guard-ordering case in this file's own e2e spec),
// not just "not found" placeholders; adding `:communityId` validation here
// requires first converting those fixtures to well-formed UUIDs, which is
// out of this PR's scope (see the uuid-path-validation branch PR notes).
export type InspectableElementErrorCode =
  | 'COMMUNITY_NOT_FOUND'
  | 'INSPECTABLE_ELEMENT_NOT_FOUND'
  | 'INVALID_ELEMENT_ID';
