import type { ReviewPhoto } from '../../domain/review-photo';

export type AddReviewPhotoResult = 'added' | 'not_editable' | 'limit_reached';

export type DiscardReviewSessionResult =
  { outcome: 'discarded'; storageKeys: string[] } | { outcome: 'not_editable' };

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
  // discardDraftWithPhotoKeys(), which write that row, serialize with it), refuses unless
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

  // Every photo of one session, `createdAt ASC, id ASC`. Callers reach it
  // only after ReviewHistoryAccessService.loadCompletedForActor (EN-164 T3).
  listForSession(reviewSessionId: string): Promise<ReviewPhoto[]>;

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

  // Discard (EN-164 S4): in ONE transaction under the session row lock,
  // refuses unless the session is a draft, reads the photo keys and deletes
  // the session (`WHERE status='draft'`; the rows go with it through ON
  // DELETE CASCADE). Reading the keys under the same lock as the delete is
  // what guarantees no committed photo's key is left out: an add either
  // committed before the lock (its key is returned) or is refused after.
  discardDraftWithPhotoKeys(
    reviewSessionId: string,
  ): Promise<DiscardReviewSessionResult>;

  // EN-222: the subset of `storageKeys` that some photo row references, in
  // any session and status. The orphan file sweep deletes only the others.
  // Not scoped to a session: the sweep is a system task, never reached by a
  // request.
  findReferencedStorageKeys(storageKeys: string[]): Promise<Set<string>>;

  // EN-222: whether any photo row exists, in any session. The sweep deletes
  // nothing when there is none, since that points at a database that does
  // not match the files (for example after a failed restore).
  hasAnyPhoto(): Promise<boolean>;
}

export const REVIEW_PHOTO_REPOSITORY = Symbol('REVIEW_PHOTO_REPOSITORY');
