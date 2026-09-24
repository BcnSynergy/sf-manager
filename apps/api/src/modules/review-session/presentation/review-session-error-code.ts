// Machine-readable discriminators for the 400/403/404/409 causes reachable
// on the review-session routes (design.md Decision 4's rejection matrix).
// Phase 5 adds ELEMENT_NOT_FOUND and ANSWERS_DO_NOT_MATCH_TEMPLATE; Phase 6
// adds UNREVIEWED_ELEMENTS_WITHOUT_REASON. Tech-debt cleanup adds
// INVALID_SESSION_ID — the `:sessionId` UUID-validation pipe shared by this
// controller and review-history.controller.ts (session-id.pipe.ts).
export type ReviewSessionErrorCode =
  | 'COMMUNITY_NOT_IN_SCOPE'
  | 'ACTIVE_TEMPLATE_NOT_FOUND'
  | 'OPEN_DRAFT_ALREADY_EXISTS'
  | 'REVIEW_SESSION_NOT_FOUND'
  | 'REVIEW_SESSION_NOT_EDITABLE'
  | 'ELEMENT_NOT_FOUND'
  | 'ANSWERS_DO_NOT_MATCH_TEMPLATE'
  | 'MISSING_OBSERVATIONS'
  | 'MISSING_ANSWERS'
  | 'UNREVIEWED_ELEMENTS_WITHOUT_REASON'
  | 'INVALID_SESSION_ID';
