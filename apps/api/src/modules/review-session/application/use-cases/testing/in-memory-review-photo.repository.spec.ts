import { ReviewSession } from '../../../domain/review-session.entity';
import { InMemoryReviewPhotoRepository } from './in-memory-review-photo.repository';
import { InMemoryReviewSessionRepository } from './in-memory-review-session.repository';

const AT = new Date('2026-11-24T10:00:00.000Z');

// EN-224: the fake's discard is now the only in-memory discard path, so it
// must keep the real adapter's guard (Prisma `WHERE status='draft'` under
// the session row lock): only a draft is deleted.
describe('InMemoryReviewPhotoRepository.discardDraftWithPhotoKeys', () => {
  let sessions: InMemoryReviewSessionRepository;
  let photos: InMemoryReviewPhotoRepository;

  const seedSession = (id: string, status: 'draft' | 'completed') => {
    sessions.seed(
      new ReviewSession({
        id,
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        status,
        startedAt: AT,
        completedAt: status === 'completed' ? AT : null,
      }),
    );
    photos.seed({
      id: `${id}-photo`,
      reviewSessionId: id,
      inspectableElementId: 'element-1',
      storageKey: `review-photos/${id}-photo.jpg`,
      sizeBytes: 4,
      createdAt: AT,
    });
  };

  beforeEach(() => {
    sessions = new InMemoryReviewSessionRepository();
    photos = new InMemoryReviewPhotoRepository(sessions);
  });

  it('discards a draft, returning its photo keys, and removes the session', async () => {
    seedSession('draft-1', 'draft');

    await expect(photos.discardDraftWithPhotoKeys('draft-1')).resolves.toEqual({
      outcome: 'discarded',
      storageKeys: ['review-photos/draft-1-photo.jpg'],
    });

    expect(sessions.statusOf('draft-1')).toBeUndefined();
    expect(photos.all()).toEqual([]);
  });

  it('refuses a completed session and keeps it with its photos', async () => {
    seedSession('done-1', 'completed');

    await expect(photos.discardDraftWithPhotoKeys('done-1')).resolves.toEqual({
      outcome: 'not_editable',
    });

    expect(sessions.statusOf('done-1')).toBe('completed');
    expect(photos.all().map((photo) => photo.id)).toEqual(['done-1-photo']);
  });

  it('refuses an unknown session', async () => {
    await expect(photos.discardDraftWithPhotoKeys('missing')).resolves.toEqual({
      outcome: 'not_editable',
    });
  });
});
