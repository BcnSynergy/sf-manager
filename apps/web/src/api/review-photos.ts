import { API_BASE_URL, apiFetch } from './client';

// EN-164: the photos of an element reviewed in a draft session. Mirrors
// apps/api/src/modules/review-session/presentation/review-photo.controller.ts
// (its `mapError` codes and ReviewPhotoResponseDto). The storage key never
// appears in a response; a photo is read from reviewPhotoUrl().
export type ReviewPhotoErrorCode =
  | 'REVIEW_PHOTO_FILE_MISSING'
  | 'REVIEW_PHOTO_UNSUPPORTED_FORMAT'
  | 'REVIEW_PHOTO_UPLOAD_INVALID'
  | 'REVIEW_PHOTO_TOO_LARGE'
  | 'REVIEW_PHOTO_LIMIT_REACHED'
  | 'REVIEW_PHOTO_NOT_FOUND';

export type ReviewPhoto = { id: string; createdAt: string };

export function listReviewPhotos(sessionId: string, elementId: string): Promise<ReviewPhoto[]> {
  return apiFetch<ReviewPhoto[]>(`/review-sessions/${sessionId}/elements/${elementId}/photos`);
}

// Multipart upload, field `file`. The caller sends the JPEG produced by
// compressPhoto(); the API checks the content, the 2 MiB limit and the
// 3-photo limit.
export function uploadReviewPhoto(
  sessionId: string,
  elementId: string,
  photo: Blob,
): Promise<ReviewPhoto> {
  const body = new FormData();
  body.append('file', photo, 'photo.jpg');
  return apiFetch<ReviewPhoto>(`/review-sessions/${sessionId}/elements/${elementId}/photos`, {
    method: 'POST',
    body,
  });
}

export function deleteReviewPhoto(sessionId: string, photoId: string): Promise<undefined> {
  return apiFetch(`/review-sessions/${sessionId}/photos/${photoId}`, { method: 'DELETE' });
}

// The photo is an <img> source and a link target, not a fetch: the browser
// sends the session cookie itself. A photo never changes, so its id alone
// makes the URL unique.
export function reviewPhotoUrl(sessionId: string, photoId: string): string {
  return `${API_BASE_URL}/review-sessions/${sessionId}/photos/${photoId}`;
}
