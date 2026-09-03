import { Inject, Injectable } from '@nestjs/common';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../ports/checklist-question.repository.port';
import {
  DRAFT_SELECTION_CLEANER,
  type DraftSelectionCleaner,
} from '../ports/draft-selection-cleaner.port';

// spec.md "Soft-Delete Checklist Question Is Never Blocked" + design.md
// Decision 6: deletion is NEVER guarded by template references — the
// deliberate inverse of SoftDeleteCommunityUseCase /
// SoftDeleteMaintenanceCompanyUseCase's active-reference guards, because a
// frozen ReviewTemplateQuestion snapshot is an audit record, not a live
// dependency. DraftSelectionCleaner is NOT a reference-checking port: it
// cannot throw/block the delete, it only cleans DRAFT selections up after
// the deletion already succeeded — "never blocked" stays structurally true.
//
// `findById` first (404 for unknown OR already-deleted id, ADR-010) then
// `softDeleteById`, which returns `wasDeleted`. Phase 7 (this PR) wires the
// DraftSelectionCleaner call here, gated on `wasDeleted === true` — the
// exact same gating discipline as SoftDeleteCommunityUseCase's
// representative cascade (design.md Decision 6): a refused delete must
// never cascade.
@Injectable()
export class SoftDeleteChecklistQuestionUseCase {
  constructor(
    @Inject(CHECKLIST_QUESTION_REPOSITORY)
    private readonly questionRepository: ChecklistQuestionRepository,
    @Inject(DRAFT_SELECTION_CLEANER)
    private readonly draftSelectionCleaner: DraftSelectionCleaner,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.questionRepository.findById(id);
    if (!existing) {
      throw new ChecklistQuestionNotFoundError();
    }

    const wasDeleted = await this.questionRepository.softDeleteById(id);
    if (!wasDeleted) {
      // Extremely rare: concurrently soft-deleted between the read above
      // and this write. findById is the sole existence oracle (ADR-010),
      // so this collapses to the same 404 as the initial check.
      throw new ChecklistQuestionNotFoundError();
    }

    // spec.md "Deletion removes the question from drafts": gated on the
    // deletion having ACTUALLY happened — mirrors
    // SoftDeleteCommunityUseCase's representative-deactivation cascade.
    await this.draftSelectionCleaner.removeQuestionFromDrafts(id);
  }
}
