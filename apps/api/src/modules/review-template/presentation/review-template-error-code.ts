// Machine-readable discriminators for the 404/409 causes reachable on the
// /review-templates routes (design.md Decision 8, Findings #2 — 5 codes
// owned by review-template itself). `CHECKLIST_QUESTION_NOT_FOUND` is a
// SIXTH code reachable on `PUT .../questions` (an unknown/soft-deleted
// selected question id) — owned and already declared by `checklist-question`
// (Phase 2), reused here rather than re-declared (tasks.md 9.5's own note).
// Mirrored as a literal union in apps/web/src/api/review-template.ts
// (Phase 10).
export type ReviewTemplateErrorCode =
  | 'REVIEW_TEMPLATE_NOT_FOUND'
  | 'REVIEW_TEMPLATE_NOT_EDITABLE'
  | 'REVIEW_TEMPLATE_EMPTY'
  | 'REVIEW_TEMPLATE_DRAFT_EXISTS'
  | 'REVIEW_TEMPLATE_ACTIVATION_CONFLICT';
