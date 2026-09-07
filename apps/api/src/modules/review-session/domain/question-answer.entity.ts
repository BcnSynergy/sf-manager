import { AnswerValue } from './answer-value';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `QuestionAnswer` model (design.md
// Interfaces/Contracts). Plain fields, no Value Objects (design.md
// Decision 9): `questionId` is provenance only — mirrors
// `ReviewTemplateQuestion.questionId`, never the source of displayed
// wording — and `answer` is a closed set already expressed by the
// `AnswerValue` union. No behaviour beyond construction.
export interface QuestionAnswerProps {
  id: string;
  elementReviewEntryId: string;
  questionId: string;
  answer: AnswerValue;
}

export class QuestionAnswer {
  readonly id: string;
  readonly elementReviewEntryId: string;
  readonly questionId: string;
  readonly answer: AnswerValue;

  constructor(props: QuestionAnswerProps) {
    this.id = props.id;
    this.elementReviewEntryId = props.elementReviewEntryId;
    this.questionId = props.questionId;
    this.answer = props.answer;
  }
}
