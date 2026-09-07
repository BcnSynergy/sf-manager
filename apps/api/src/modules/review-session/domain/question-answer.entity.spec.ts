import { QuestionAnswer, QuestionAnswerProps } from './question-answer.entity';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `QuestionAnswer` model (design.md
// Interfaces/Contracts). Plain fields, no Value Objects (design.md
// Decision 9): `questionId` is provenance only, `answer` is a closed set
// already expressed by the `AnswerValue` union. No behaviour beyond
// construction — mirrors `checklist-question.entity.ts`'s shape.
const makeAnswer = (
  overrides: Partial<QuestionAnswerProps> = {},
): QuestionAnswer =>
  new QuestionAnswer({
    id: '01930000-0000-7000-8000-000000000601',
    elementReviewEntryId: '01930000-0000-7000-8000-000000000602',
    questionId: '01930000-0000-7000-8000-000000000603',
    answer: 'YES',
    ...overrides,
  });

describe('QuestionAnswer', () => {
  it('constructs an answer with the given identity and value', () => {
    const answer = makeAnswer({ answer: 'NOT_APPLICABLE' });

    expect(answer.id).toBe('01930000-0000-7000-8000-000000000601');
    expect(answer.elementReviewEntryId).toBe(
      '01930000-0000-7000-8000-000000000602',
    );
    expect(answer.questionId).toBe('01930000-0000-7000-8000-000000000603');
    expect(answer.answer).toBe('NOT_APPLICABLE');
  });
});
