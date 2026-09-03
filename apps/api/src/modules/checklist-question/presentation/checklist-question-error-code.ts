// Machine-readable discriminator for the 404 Not Found cause reachable on
// PATCH/DELETE `.../checklist-questions/:id` (spec.md "Update Checklist
// Question" / "Soft-Delete Checklist Question Is Never Blocked" — both
// specify `code: CHECKLIST_QUESTION_NOT_FOUND`). Only one 404 cause exists
// on this module's routes (unlike inspectable-element's two), but the code
// is still declared per the coded-error convention so the response shape
// is stable and clients can match on it without string-comparing `message`.
// Mirrored as a literal union in apps/web/src/api/checklist-question.ts
// (Phase 5); kept as a local copy per the coded-error convention rather
// than hoisted into @sf-manager/validation.
export type ChecklistQuestionErrorCode = 'CHECKLIST_QUESTION_NOT_FOUND';
