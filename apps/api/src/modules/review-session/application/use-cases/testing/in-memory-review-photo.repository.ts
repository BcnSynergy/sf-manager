import type { ReviewPhoto } from '../../../domain/review-photo';
import type {
  AddReviewPhotoResult,
  DeleteReviewPhotoResult,
  ReviewPhotoRepository,
} from '../../ports/review-photo.repository.port';
import type { InMemoryReviewSessionRepository } from './in-memory-review-session.repository';

// Test double for ReviewPhotoRepository. The session status comes from the
// in-memory session repository, and a photo whose session no longer exists is
// invisible, which mirrors ON DELETE CASCADE after a discard. Each method is
// synchronous inside, so the check and the insert cannot interleave, as the
// row lock guarantees on Postgres.
export class InMemoryReviewPhotoRepository implements ReviewPhotoRepository {
  private readonly photos: ReviewPhoto[] = [];

  constructor(private readonly sessions: InMemoryReviewSessionRepository) {}

  all(): ReviewPhoto[] {
    return this.photos.filter(
      (photo) => this.sessions.statusOf(photo.reviewSessionId) !== undefined,
    );
  }

  seed(photo: ReviewPhoto): void {
    this.photos.push(photo);
  }

  addToDraft(
    photo: ReviewPhoto,
    maxPerElement: number,
  ): Promise<AddReviewPhotoResult> {
    if (this.sessions.statusOf(photo.reviewSessionId) !== 'draft') {
      return Promise.resolve('not_editable');
    }
    const count = this.all().filter(
      (existing) =>
        existing.reviewSessionId === photo.reviewSessionId &&
        existing.inspectableElementId === photo.inspectableElementId,
    ).length;
    if (count >= maxPerElement) {
      return Promise.resolve('limit_reached');
    }
    this.photos.push(photo);
    return Promise.resolve('added');
  }

  listForElement(
    reviewSessionId: string,
    inspectableElementId: string,
  ): Promise<ReviewPhoto[]> {
    return Promise.resolve(
      this.all()
        .filter(
          (photo) =>
            photo.reviewSessionId === reviewSessionId &&
            photo.inspectableElementId === inspectableElementId,
        )
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        ),
    );
  }

  findInSession(
    reviewSessionId: string,
    photoId: string,
  ): Promise<ReviewPhoto | null> {
    return Promise.resolve(
      this.all().find(
        (photo) =>
          photo.reviewSessionId === reviewSessionId && photo.id === photoId,
      ) ?? null,
    );
  }

  deleteFromDraft(
    reviewSessionId: string,
    photoId: string,
  ): Promise<DeleteReviewPhotoResult> {
    const status = this.sessions.statusOf(reviewSessionId);
    if (status === undefined) return Promise.resolve({ outcome: 'not_found' });
    if (status !== 'draft') return Promise.resolve({ outcome: 'not_editable' });
    const index = this.photos.findIndex(
      (photo) =>
        photo.reviewSessionId === reviewSessionId && photo.id === photoId,
    );
    if (index === -1) return Promise.resolve({ outcome: 'not_found' });
    const [removed] = this.photos.splice(index, 1);
    return Promise.resolve({
      outcome: 'deleted',
      storageKey: removed.storageKey,
    });
  }

  listKeysForSession(reviewSessionId: string): Promise<string[]> {
    return Promise.resolve(
      this.all()
        .filter((photo) => photo.reviewSessionId === reviewSessionId)
        .map((photo) => photo.storageKey),
    );
  }
}
