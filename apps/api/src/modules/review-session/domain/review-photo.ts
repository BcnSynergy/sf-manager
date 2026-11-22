import { detectLogoFormat } from '../../organization-profile/domain/organization-logo';

// EN-164 S2: the API accepts a photo only as JPEG (decided by the content,
// never by the name or the declared type), at most 2 MiB, and at most 3 per
// element per review session. The web app resizes and re-encodes before
// upload; these are the server's own limits.
export const REVIEW_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const REVIEW_PHOTOS_PER_ELEMENT_MAX = 3;
export const REVIEW_PHOTO_CONTENT_TYPE = 'image/jpeg';

// A photo is owned by one element reviewed in one session (EN-164 S1), never
// by the ElementReviewEntry id. `storageKey` stays inside the API: no
// response carries it.
export interface ReviewPhoto {
  id: string;
  reviewSessionId: string;
  inspectableElementId: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: Date;
}

// Reuses the logo's JPEG check: SOI, then marker segments up to a
// start-of-frame segment with a width and height above zero (EN-111).
export function isJpegPhoto(content: Uint8Array): boolean {
  return detectLogoFormat(content)?.extension === 'jpg';
}

export function reviewPhotoKey(id: string): string {
  return `review-photos/${id}.jpg`;
}
