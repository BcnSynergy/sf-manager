import {
  Prisma,
  ReviewSession as PrismaReviewSession,
  ElementReviewEntry as PrismaElementReviewEntry,
  QuestionAnswer as PrismaQuestionAnswer,
} from '@prisma/client';
import { ReviewSession } from '../../domain/review-session.entity';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';

type EntryWithAnswers = PrismaElementReviewEntry & {
  answers: PrismaQuestionAnswer[];
};

// ADR-013: dedicated mapper between Prisma's row-shaped query results and
// the hand-written domain entities — mirrors ReviewTemplateMapper. The
// three FKs rooted at ReviewSession are hand-written and Prisma-invisible
// (no `@relation`, ADR-013), so there is no Prisma relation to `include` —
// the repository loads ElementReviewEntry/QuestionAnswer rows with separate
// queries and this mapper assembles them into the aggregate.
export class ReviewSessionMapper {
  static toDomain(
    record: PrismaReviewSession,
    entryRecords: EntryWithAnswers[] = [],
  ): ReviewSession {
    return new ReviewSession({
      id: record.id,
      communityId: record.communityId,
      templateId: record.templateId,
      performedById: record.performedById,
      status: record.status,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      performedByCompanyId: record.performedByCompanyId,
      entries: entryRecords.map((entry) => this.entryToDomain(entry)),
    });
  }

  // design.md Decision 1: an entry's `observations` column is NON-NULL iff
  // unreviewed — the persisted row already satisfies the invariant (write
  // path enforces it, hand-written CHECK backstops it), so hydration simply
  // dispatches on which factory the stored shape matches. No re-validation
  // is performed here — that is the write path's job, not the read path's.
  private static entryToDomain(entry: EntryWithAnswers): ElementReviewEntry {
    if (entry.observations !== null) {
      return ElementReviewEntry.unreviewed({
        id: entry.id,
        reviewSessionId: entry.reviewSessionId,
        inspectableElementId: entry.inspectableElementId,
        observations: entry.observations,
        recordedAt: entry.recordedAt,
      });
    }

    return ElementReviewEntry.reviewed({
      id: entry.id,
      reviewSessionId: entry.reviewSessionId,
      inspectableElementId: entry.inspectableElementId,
      answers: entry.answers.map(
        (answer) =>
          new QuestionAnswer({
            id: answer.id,
            elementReviewEntryId: answer.elementReviewEntryId,
            questionId: answer.questionId,
            answer: answer.answer,
          }),
      ),
      recordedAt: entry.recordedAt,
    });
  }

  static toPersistence(
    session: ReviewSession,
  ): Prisma.ReviewSessionCreateInput {
    return {
      id: session.id,
      communityId: session.communityId,
      templateId: session.templateId,
      performedById: session.performedById,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      performedByCompanyId: session.performedByCompanyId,
    };
  }
}
