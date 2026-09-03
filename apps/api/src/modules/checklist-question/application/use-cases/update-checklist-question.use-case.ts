import { Inject, Injectable } from '@nestjs/common';
import type { ElementType } from '@sf-manager/validation';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import { ReviewFrequency } from '../../domain/review-frequency';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../ports/checklist-question.repository.port';

export interface UpdateChecklistQuestionInput {
  id: string;
  text?: string;
  frequencies?: ReviewFrequency[];
}

export interface UpdateChecklistQuestionResult {
  id: string;
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
}

// spec.md "Update Checklist Question": elementType is NEVER part of
// `changes` — a question does not change type in this slice (mirrors
// UpdateInspectableElementUseCase's communityId/elementType omission). A
// non-existent or soft-deleted id resolves to the same
// ChecklistQuestionNotFoundError (404 CHECKLIST_QUESTION_NOT_FOUND, Phase
// 4) — ADR-010's default deletedAt: null filter makes them
// indistinguishable via findById.
@Injectable()
export class UpdateChecklistQuestionUseCase {
  constructor(
    @Inject(CHECKLIST_QUESTION_REPOSITORY)
    private readonly questionRepository: ChecklistQuestionRepository,
  ) {}

  async execute(
    input: UpdateChecklistQuestionInput,
  ): Promise<UpdateChecklistQuestionResult> {
    const { id, ...changes } = input;

    const existing = await this.questionRepository.findById(id);
    if (!existing) {
      throw new ChecklistQuestionNotFoundError();
    }

    await this.questionRepository.updateById(id, {
      text: changes.text,
      frequencies: changes.frequencies,
    });

    return {
      id: existing.id,
      elementType: existing.elementType,
      text: changes.text ?? existing.text,
      frequencies: changes.frequencies ?? existing.frequencies,
    };
  }
}
