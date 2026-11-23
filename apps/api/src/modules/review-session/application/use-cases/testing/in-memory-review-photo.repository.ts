import type { ReviewPhoto } from '../../../domain/review-photo';
import type {
  AddReviewPhotoResult,
  DeleteReviewPhotoResult,
  DiscardReviewSessionResult,
  ReviewPhotoRepository,
} from '../../ports/review-photo.repository.port';
import type { InMemoryReviewSessionRepository } from './in-memory-review-session.repository';

// `createdAt ASC, id ASC`, as the Prisma adapter orders.
function byCreation(a: ReviewPhoto, b: ReviewPhoto): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

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

  // Rows of a discarded session are gone (ON DELETE CASCADE), so only
  // visible photos count.
  findReferencedStorageKeys(storageKeys: string[]): Promise<Set<string>> {
    const referenced = new Set(this.all().map((photo) => photo.storageKey));
    return Promise.resolve(
      new Set(storageKeys.filter((key) => referenced.has(key))),
    );
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
        .sort(byCreation),
    );
  }

  listForSession(reviewSessionId: string): Promise<ReviewPhoto[]> {
    return Promise.resolve(
      this.all()
        .filter((photo) => photo.reviewSessionId === reviewSessionId)
        .sort(byCreation),
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

  async discardDraftWithPhotoKeys(
    reviewSessionId: string,
  ): Promise<DiscardReviewSessionResult> {
    if (this.sessions.statusOf(reviewSessionId) !== 'draft') {
      return { outcome: 'not_editable' };
    }
    const storageKeys = this.all()
      .filter((photo) => photo.reviewSessionId === reviewSessionId)
      .map((photo) => photo.storageKey);
    // The photos disappear with the session (cascade, see all()).
    await this.sessions.discardDraft(reviewSessionId);
    return { outcome: 'discarded', storageKeys };
  }
}
