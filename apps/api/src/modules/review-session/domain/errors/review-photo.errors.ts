import {
  REVIEW_PHOTO_MAX_BYTES,
  REVIEW_PHOTOS_PER_ELEMENT_MAX,
} from '../review-photo';

export class ReviewPhotoTooLargeError extends Error {
  constructor() {
    super(`The photo must be at most ${REVIEW_PHOTO_MAX_BYTES} bytes.`);
    this.name = 'ReviewPhotoTooLargeError';
  }
}

export class UnsupportedReviewPhotoFormatError extends Error {
  constructor() {
    super('The photo must be a JPEG image.');
    this.name = 'UnsupportedReviewPhotoFormatError';
  }
}

export class ReviewPhotoLimitReachedError extends Error {
  constructor() {
    super(
      `An element takes at most ${REVIEW_PHOTOS_PER_ELEMENT_MAX} photos per review session.`,
    );
    this.name = 'ReviewPhotoLimitReachedError';
  }
}

// Unknown photo, or a photo of another session: indistinguishable.
export class ReviewPhotoNotFoundError extends Error {
  constructor() {
    super('Review photo not found');
    this.name = 'ReviewPhotoNotFoundError';
  }
}
