import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  deleteReviewPhoto,
  listReviewPhotos,
  reviewPhotoUrl,
  uploadReviewPhoto,
  type ReviewPhoto,
  type ReviewPhotoErrorCode,
} from '../api/review-photos';
import type { ReviewSessionErrorCode } from '../api/review-session';
import { Alert, StatusRegion } from '../components/Alert';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAlertMessage } from '../components/use-alert-message';
import type { MessageKey } from '../i18n/message-key';
import { compressPhoto } from './compress-photo';

// EN-164 S2: the API's per-element limit, also enforced there.
export const MAX_PHOTOS_PER_ELEMENT = 3;

const HTTP_PAYLOAD_TOO_LARGE = 413;

type Props = {
  sessionId: string;
  elementId: string;
  // A completed session's photos are fixed (S3): shown, never changed.
  readOnly: boolean;
};

type LoadState = 'loading' | 'loaded' | 'error';

// EN-164 S5: the photos of one element in one session. A chosen photo is
// compressed and uploaded at once, separate from the answers' Save. On a
// phone the file input opens the rear camera (`capture="environment"`); on a
// desktop it opens a file picker. Each thumbnail links to the full photo.
export function ReviewPhotosSection({ sessionId, elementId, readOnly }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(true);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { messageKey: error, key: errorAlertKey, show: showError, clear } = useAlertMessage();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listReviewPhotos(sessionId, elementId)
      .then((listed) => {
        if (active) {
          setPhotos(listed);
          setLoadState('loaded');
        }
      })
      .catch(() => {
        if (active) {
          setLoadState('error');
        }
      });
    return () => {
      active = false;
    };
  }, [sessionId, elementId]);

  // After a limit rejection (a photo added elsewhere, for example in another
  // tab), the list here is stale: read it again so the limit note shows.
  function reloadPhotos() {
    listReviewPhotos(sessionId, elementId)
      .then((listed) => {
        if (mountedRef.current) {
          setPhotos(listed);
        }
      })
      .catch(() => undefined);
  }

  async function handleFile(file: File | undefined) {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (!file) {
      return;
    }
    clear();
    setUploading(true);
    try {
      let compressed: Blob;
      try {
        compressed = await compressPhoto(file);
      } catch {
        showError('reviewSession.photos.readError');
        return;
      }
      const photo = await uploadReviewPhoto(sessionId, elementId, compressed);
      setPhotos((current) => [...current, photo]);
    } catch (uploadError) {
      if (uploadError instanceof ApiError && uploadError.code === 'REVIEW_PHOTO_LIMIT_REACHED') {
        reloadPhotos();
      }
      showError(photoErrorKey(uploadError, 'reviewSession.photos.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(photoId: string) {
    setConfirmingId(null);
    clear();
    setRemovingId(photoId);
    try {
      await deleteReviewPhoto(sessionId, photoId);
      setPhotos((current) => current.filter((photo) => photo.id !== photoId));
      // The Remove button that had focus is gone; keep the keyboard user in
      // the section.
      headingRef.current?.focus();
    } catch (removeError) {
      // Already gone (removed elsewhere): drop it here too.
      if (removeError instanceof ApiError && removeError.code === 'REVIEW_PHOTO_NOT_FOUND') {
        setPhotos((current) => current.filter((photo) => photo.id !== photoId));
      }
      showError(photoErrorKey(removeError, 'reviewSession.photos.removeError'));
    } finally {
      setRemovingId(null);
    }
  }

  const busy = uploading || removingId !== null;
  const canAdd = !readOnly && loadState === 'loaded' && photos.length < MAX_PHOTOS_PER_ELEMENT;

  return (
    <section className="sf-section" aria-labelledby="review-photos-title">
      <h2 ref={headingRef} id="review-photos-title" className="sf-section-title" tabIndex={-1}>
        {t('reviewSession.photos.title')}
      </h2>
      {loadState === 'loading' && (
        <p className="sf-empty" data-testid="review-photos-loading">
          {t('reviewSession.photos.loading')}
        </p>
      )}
      {loadState === 'error' && (
        <p className="sf-empty" data-testid="review-photos-load-error">
          {t('reviewSession.photos.loadError')}
        </p>
      )}
      {loadState === 'loaded' && photos.length === 0 && (
        <p className="sf-empty" data-testid="review-photos-empty">
          {t('reviewSession.photos.empty')}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="sf-photo-list" data-testid="review-photos-list">
          {photos.map((photo, index) => (
            <li key={photo.id} className="sf-photo-item">
              <a
                href={reviewPhotoUrl(sessionId, photo.id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('reviewSession.photos.openLabel', { number: index + 1 })}
                data-testid={`review-photo-link-${photo.id}`}
              >
                <img
                  className="sf-photo-thumb"
                  src={reviewPhotoUrl(sessionId, photo.id)}
                  alt={t('reviewSession.photos.alt', { number: index + 1 })}
                  data-testid={`review-photo-${photo.id}`}
                />
              </a>
              {!readOnly && (
                <button
                  type="button"
                  className="sf-btn sf-btn-danger"
                  onClick={() => setConfirmingId(photo.id)}
                  disabled={busy}
                  aria-label={t('reviewSession.photos.removeNumberedLabel', { number: index + 1 })}
                  data-testid={`review-photo-remove-${photo.id}`}
                >
                  {t('reviewSession.photos.removeLabel')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <StatusRegion>
        {uploading && (
          <p className="sf-empty" data-testid="review-photos-uploading">
            {t('reviewSession.photos.uploading')}
          </p>
        )}
      </StatusRegion>
      {error && (
        <Alert key={errorAlertKey} tone="danger" testId="review-photos-error" message={t(error)} />
      )}
      {!readOnly && loadState === 'loaded' && (
        <div className="sf-actions">
          {canAdd ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(event) => void handleFile(event.target.files?.[0])}
                data-testid="review-photos-input"
              />
              <button
                type="button"
                className="sf-btn"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                data-testid="review-photos-add"
              >
                {t('reviewSession.photos.addLabel')}
              </button>
            </>
          ) : (
            <p className="sf-empty" data-testid="review-photos-limit">
              {t('reviewSession.photos.limitHint', { max: MAX_PHOTOS_PER_ELEMENT })}
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmingId !== null}
        title={t('reviewSession.photos.removeConfirmTitle')}
        message={t('reviewSession.photos.removeConfirmMessage')}
        confirmLabel={t('reviewSession.photos.removeLabel')}
        tone="danger"
        onConfirm={() => {
          if (confirmingId !== null) {
            void handleRemove(confirmingId);
          }
        }}
        onCancel={() => setConfirmingId(null)}
      />
    </section>
  );
}

// Branches on status and code only, never on the server's message text.
function photoErrorKey(error: unknown, fallback: MessageKey): MessageKey {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  if (error.status === HTTP_PAYLOAD_TOO_LARGE) {
    return 'reviewSession.photos.tooLarge';
  }
  const code = error.code as ReviewPhotoErrorCode | ReviewSessionErrorCode | undefined;
  switch (code) {
    case 'REVIEW_PHOTO_LIMIT_REACHED':
      return 'reviewSession.photos.limitReached';
    case 'REVIEW_PHOTO_UNSUPPORTED_FORMAT':
      return 'reviewSession.photos.readError';
    case 'REVIEW_PHOTO_NOT_FOUND':
      return 'reviewSession.photos.notFound';
    case 'REVIEW_SESSION_NOT_EDITABLE':
      return 'reviewSession.error.sessionNotEditable';
    default:
      return error.status === 0 ? 'common.error.network' : fallback;
  }
}
