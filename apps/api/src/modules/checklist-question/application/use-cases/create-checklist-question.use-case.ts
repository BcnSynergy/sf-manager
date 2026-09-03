import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import { ChecklistQuestion } from '../../domain/checklist-question.entity';
import { InvalidChecklistQuestionInputError } from '../../domain/errors/invalid-checklist-question-input.error';
import type { ElementType } from '@sf-manager/validation';
import { ReviewFrequency } from '../../domain/review-frequency';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../ports/checklist-question.repository.port';

export interface CreateChecklistQuestionInput {
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
}

export interface CreateChecklistQuestionResult {
  id: string;
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
}

// spec.md "Create Checklist Question": global pool, no parent guard (unlike
// InspectableElement, there is no community to check first). `id` is
// generated (ADR-009), `deletedAt` always initializes to null. No
// uniqueness read-check: duplicate `text` is explicitly allowed. The
// `assertValidInput` guard is defense-in-depth for empty `frequencies` /
// missing-or-blank required fields — the same rule the shared Zod schema
// (createChecklistQuestionSchema, packages/validation, task 3.7) enforces
// at the HTTP boundary (design.md Decision 7 / ADR-015); this only protects
// a direct application-layer caller that bypasses the DTO pipe.
@Injectable()
export class CreateChecklistQuestionUseCase {
  constructor(
    @Inject(CHECKLIST_QUESTION_REPOSITORY)
    private readonly questionRepository: ChecklistQuestionRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    input: CreateChecklistQuestionInput,
  ): Promise<CreateChecklistQuestionResult> {
    this.assertValidInput(input);

    const question = new ChecklistQuestion({
      id: this.idGenerator.generate(),
      elementType: input.elementType,
      frequencies: input.frequencies,
      text: input.text,
      deletedAt: null,
    });

    await this.questionRepository.create(question);

    return {
      id: question.id,
      elementType: question.elementType,
      frequencies: question.frequencies,
      text: question.text,
    };
  }

  private assertValidInput(input: CreateChecklistQuestionInput): void {
    if (
      !input.elementType ||
      !input.frequencies ||
      input.frequencies.length === 0 ||
      !input.text?.trim()
    ) {
      throw new InvalidChecklistQuestionInputError();
    }
  }
}
