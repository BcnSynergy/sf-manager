import { Inject, Injectable } from '@nestjs/common';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../ports/checklist-question.repository.port';

// spec.md "Soft-Delete Checklist Question Is Never Blocked" + design.md
// Decision 6: deletion is NEVER guarded by template references — the
// deliberate inverse of SoftDeleteCommunityUseCase /
// SoftDeleteMaintenanceCompanyUseCase's active-reference guards, because a
// frozen ReviewTemplateQuestion snapshot is an audit record, not a live
// dependency. This use case injects only ChecklistQuestionRepository — no
// counter/reference port at all — which is what makes "never blocked"
// structural rather than a runtime check someone could accidentally add
// a guard in front of later.
//
// `findById` first (404 for unknown OR already-deleted id, ADR-010) then
// `softDeleteById`, which returns `wasDeleted`. Phase 7 wires a
// DraftSelectionCleaner call here, gated on `wasDeleted === true` — the
// exact same gating discipline as SoftDeleteCommunityUseCase's
// representative cascade (design.md Decision 6). Deliberately NOT wired
// in this PR: the extension point is the `wasDeleted` check below, with
// nothing else in the method body that would make adding it later
// structurally awkward.
@Injectable()
export class SoftDeleteChecklistQuestionUseCase {
  constructor(
    @Inject(CHECKLIST_QUESTION_REPOSITORY)
    private readonly questionRepository: ChecklistQuestionRepository,
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

    // Phase 7 extension point (design.md Decision 6): once
    // DraftSelectionCleaner exists, call
    // `draftSelectionCleaner.removeQuestionFromDrafts(id)` here, gated on
    // `wasDeleted === true` above. Not implemented in this PR.
  }
}
