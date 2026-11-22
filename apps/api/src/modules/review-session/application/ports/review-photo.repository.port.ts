import type { ReviewPhoto } from '../../domain/review-photo';

export type AddReviewPhotoResult = 'added' | 'not_editable' | 'limit_reached';

export type DeleteReviewPhotoResult =
  | { outcome: 'deleted'; storageKey: string }
  | { outcome: 'not_found' }
  | { outcome: 'not_editable' };

// Port (application layer, ADR-002/013) for EN-164 photos. Like
// ReviewSessionRepository it has no bare `findById`: every read names the
// session it is scoped to. Callers reach it only after
// SessionAccessService.loadForActor has proven the actor performs the
// session.
export interface ReviewPhotoRepository {
  // Atomic: locks the session row (`FOR UPDATE`, so complete() and
  // discardDraft(), which write that row, serialize with it), refuses unless
  // the session is a draft, counts the element's photos in the session and
  // inserts only below `maxPerElement`. The row lock is what keeps the limit
  // under concurrent uploads.
  addToDraft(
    photo: ReviewPhoto,
    maxPerElement: number,
  ): Promise<AddReviewPhotoResult>;

  // `createdAt ASC, id ASC`.
  listForElement(
    reviewSessionId: string,
    inspectableElementId: string,
  ): Promise<ReviewPhoto[]>;

  findInSession(
    reviewSessionId: string,
    photoId: string,
  ): Promise<ReviewPhoto | null>;

  // Same lock and draft check as addToDraft; returns the key of the deleted
  // row so the caller can delete the file.
  deleteFromDraft(
    reviewSessionId: string,
    photoId: string,
  ): Promise<DeleteReviewPhotoResult>;

  // For discard: the keys whose files must go when the session is deleted
  // (the rows go with it through ON DELETE CASCADE).
  listKeysForSession(reviewSessionId: string): Promise<string[]>;
}

export const REVIEW_PHOTO_REPOSITORY = Symbol('REVIEW_PHOTO_REPOSITORY');
