import { Inject, Injectable } from '@nestjs/common';
import type { ElementType } from '@sf-manager/validation';
import { ReviewFrequency } from '../../domain/review-frequency';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../ports/checklist-question.repository.port';

export interface ListedChecklistQuestion {
  id: string;
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
}

// spec.md "List Checklist Questions": global pool, no parent guard (unlike
// ListInspectableElementsByCommunityUseCase, there is no community to
// check first). `findAll` already excludes soft-deleted rows by
// construction (ADR-010); this use case adds no filtering of its own. An
// empty pool is a valid response, not an error (spec.md "The Pool Ships
// Empty").
@Injectable()
export class ListChecklistQuestionsUseCase {
  constructor(
    @Inject(CHECKLIST_QUESTION_REPOSITORY)
    private readonly questionRepository: ChecklistQuestionRepository,
  ) {}

  async execute(): Promise<ListedChecklistQuestion[]> {
    const questions = await this.questionRepository.findAll();

    return questions.map((question) => ({
      id: question.id,
      elementType: question.elementType,
      frequencies: question.frequencies,
      text: question.text,
    }));
  }
}
