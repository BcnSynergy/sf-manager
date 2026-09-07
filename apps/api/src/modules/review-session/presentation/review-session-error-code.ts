// Machine-readable discriminators for the 403/404/409 causes reachable on
// the /review-scope and /review-sessions routes wired in this PR
// (design.md Decision 4's rejection matrix). Phase 5/6 add
// ELEMENT_NOT_FOUND, REVIEW_SESSION_NOT_EDITABLE (write routes),
// ANSWERS_DO_NOT_MATCH_TEMPLATE and UNREVIEWED_ELEMENTS_WITHOUT_REASON.
export type ReviewSessionErrorCode =
  | 'COMMUNITY_NOT_IN_SCOPE'
  | 'ACTIVE_TEMPLATE_NOT_FOUND'
  | 'OPEN_DRAFT_ALREADY_EXISTS'
  | 'REVIEW_SESSION_NOT_FOUND'
  | 'REVIEW_SESSION_NOT_EDITABLE';
