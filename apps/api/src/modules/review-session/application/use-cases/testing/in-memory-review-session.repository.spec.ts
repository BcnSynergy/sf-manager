import { ElementReviewEntry } from '../../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../../domain/question-answer.entity';
import { ReviewSession } from '../../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './in-memory-review-session.repository';

// Fresh-context review on PR4, finding #C: the port's `upsertEntry` took a
// separate `answers` parameter alongside `entry`, which already carries
// `entry.answers` (ElementReviewEntry.reviewed()/.unreviewed() — the
// domain invariant's only construction paths, design.md Decision 1). The
// two doubles disagreed on which one was authoritative for persistence,
// AND on the missing-session case (this fake silently no-op'd; the Prisma
// adapter would hit a real FK violation and throw). Resolution: `answers`
// was redundant — `entry.answers` is the single source of truth — so the
// port signature drops the second parameter entirely, and both doubles now
// throw the SAME ReviewSessionNotFoundError for an unknown sessionId.
describe('InMemoryReviewSessionRepository.upsertEntry (review finding #C)', () => {
  function buildSession(overrides: Partial<{ status: 'draft' | 'completed' }> = {}) {
    return new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      status: overrides.status ?? 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
    });
  }

  it("persists entry.answers as the authoritative answer set — there is no separate answers parameter", async () => {
    const repository = new InMemoryReviewSessionRepository();
    const session = buildSession();
    repository.seed(session);

    const answer = new QuestionAnswer({
      id: 'answer-1',
      elementReviewEntryId: 'entry-1',
      questionId: 'question-1',
      answer: 'YES',
    });
    const entry = ElementReviewEntry.reviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-1',
      answers: [answer],
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await repository.upsertEntry('session-1', entry);

    const stored = await repository.findByIdForPerformer('session-1', 'user-1');
    expect(stored?.entries[0].answers).toEqual([answer]);
  });

  it('rejects with ReviewSessionNotFoundError for an unknown sessionId, matching the real Prisma adapter instead of silently no-op-ing', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const entry = ElementReviewEntry.unreviewed({
      id: 'entry-1',
      reviewSessionId: 'does-not-exist',
      inspectableElementId: 'element-1',
      observations: 'Not accessible this cycle',
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      repository.upsertEntry('does-not-exist', entry),
    ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
  });
});
