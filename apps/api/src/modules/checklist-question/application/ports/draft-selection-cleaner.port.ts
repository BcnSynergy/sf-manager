// Port (application layer, ADR-002/013), owned by `checklist-question` —
// design.md Decision 6: `checklist-question` must reach "ReviewTemplate",
// the reverse of the sanctioned `review-template -> checklist-question`
// dependency direction. Registering the reverse module import would close a
// Nest DI cycle, so instead `checklist-question` owns this narrow one-method
// port plus its own adapter (`PrismaDraftSelectionCleaner`,
// infrastructure/persistence/), resolving `PrismaService` through the
// `@Global()` `PrismaModule` with NO module import at all. Exact analogue of
// `community/application/ports/inspectable-element-counter.port.ts` /
// `PrismaInspectableElementCounter` — this is what keeps the Nest module
// graph acyclic without `forwardRef()`.
export interface DraftSelectionCleaner {
  // Strips a soft-deleted question's id out of every DRAFT template's
  // ordered selection (`ReviewTemplate.draftQuestionIds`). Run AFTER the
  // soft-delete and gated on it having happened
  // (soft-delete-checklist-question.use-case.ts, `wasDeleted === true`) —
  // exactly as SoftDeleteCommunityUseCase gates the representative cascade.
  // No cross-repository transaction: non-atomicity is safe here because the
  // draft read path (design.md Decision 5) filters soft-deleted questions
  // independently, so a failed cleanup is a convergence lag, never a
  // visible defect.
  removeQuestionFromDrafts(questionId: string): Promise<void>;
}

export const DRAFT_SELECTION_CLEANER = Symbol('DRAFT_SELECTION_CLEANER');
