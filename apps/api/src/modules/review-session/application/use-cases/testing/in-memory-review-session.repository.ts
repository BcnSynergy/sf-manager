import { ElementReviewEntry } from '../../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../../domain/question-answer.entity';
import { ReviewSession } from '../../../domain/review-session.entity';
import { OpenDraftAlreadyExistsError } from '../../../domain/errors/open-draft-already-exists.error';
import { ReviewSessionRepository } from '../../ports/review-session.repository.port';

// Test double for ReviewSessionRepository (design.md Testing Strategy:
// in-memory fakes mirroring the shipped module shape, tasks.md 4.9). Keyed
// by id; also mirrors the hand-written partial unique index
// `ReviewSession_open_draft_key` on (communityId, templateId,
// performedById) WHERE status='draft' (design.md Interfaces/Contracts) —
// create() rejects a second open draft for the same triple exactly like
// PrismaReviewSessionRepository.create() will (P2002 ->
// OpenDraftAlreadyExistsError).
export class InMemoryReviewSessionRepository implements ReviewSessionRepository {
  private readonly sessionsById = new Map<string, ReviewSession>();

  seed(session: ReviewSession): void {
    this.sessionsById.set(session.id, session);
  }

  private openDraftKey(session: ReviewSession): string {
    return `${session.communityId}::${session.templateId}::${session.performedById}`;
  }

  create(session: ReviewSession): Promise<void> {
    if (session.status === 'draft') {
      const key = this.openDraftKey(session);
      const collision = [...this.sessionsById.values()].some(
        (existing) =>
          existing.status === 'draft' && this.openDraftKey(existing) === key,
      );
      if (collision) {
        return Promise.reject(new OpenDraftAlreadyExistsError());
      }
    }
    this.sessionsById.set(session.id, session);
    return Promise.resolve();
  }

  findByIdForPerformer(
    id: string,
    performedById: string,
  ): Promise<ReviewSession | null> {
    const session = this.sessionsById.get(id);
    if (!session || session.performedById !== performedById) {
      return Promise.resolve(null);
    }
    return Promise.resolve(session);
  }

  findDraftsByPerformer(performedById: string): Promise<ReviewSession[]> {
    return Promise.resolve(
      [...this.sessionsById.values()].filter(
        (session) =>
          session.performedById === performedById && session.status === 'draft',
      ),
    );
  }

  upsertEntry(
    sessionId: string,
    entry: ElementReviewEntry,
    answers: QuestionAnswer[],
  ): Promise<void> {
    void answers; // Phase 5's real caller; this fake stores entries only.
    const session = this.sessionsById.get(sessionId);
    if (!session) {
      return Promise.resolve();
    }
    session.recordEntry(entry);
    return Promise.resolve();
  }

  complete(id: string, at: Date): Promise<boolean> {
    const session = this.sessionsById.get(id);
    if (!session || session.status !== 'draft') {
      return Promise.resolve(false);
    }
    this.sessionsById.set(
      id,
      new ReviewSession({
        id: session.id,
        communityId: session.communityId,
        templateId: session.templateId,
        performedById: session.performedById,
        status: 'completed',
        startedAt: session.startedAt,
        completedAt: at,
        entries: session.entries,
      }),
    );
    return Promise.resolve(true);
  }

  discardDraft(id: string): Promise<boolean> {
    const session = this.sessionsById.get(id);
    if (!session || session.status !== 'draft') {
      return Promise.resolve(false);
    }
    this.sessionsById.delete(id);
    return Promise.resolve(true);
  }
}
