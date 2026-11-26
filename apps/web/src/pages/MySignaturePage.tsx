import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  getOwnSignature,
  ownSignatureImageUrl,
  uploadOwnSignature,
  type ReviewerSignatureErrorCode,
} from '../api/reviewer-signature';
import { Alert, StatusRegion } from '../components/Alert';
import { PageHeader } from '../components/PageHeader';
import { useAlertMessage } from '../components/use-alert-message';
import type { MessageKey } from '../i18n/message-key';

// reviewer-signature: the API's own limits, checked here first so an
// obviously wrong file never costs a request. The API still decides by the
// file's content.
const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
const SIGNATURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const HTTP_PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_FORMAT: ReviewerSignatureErrorCode = 'SIGNATURE_UNSUPPORTED_FORMAT';

type LoadState = 'loading' | 'loaded' | 'error';

// reviewer-signature-ui, "See and Replace the Own Signature". Same shape as
// the organization logo section: the preview is an <img> on the image
// endpoint whose `version` changes after each upload, and a failed image
// load gives way to a message instead of a broken image.
export function MySignaturePage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasSignature, setHasSignature] = useState(false);
  const [version, setVersion] = useState(() => Date.now());
  const [imageFailed, setImageFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const {
    messageKey: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();

  useEffect(() => {
    let cancelled = false;
    getOwnSignature()
      .then((status) => {
        if (!cancelled) {
          setHasSignature(status.hasSignature);
          setLoadState('loaded');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleFileChange(chosen: File | null) {
    setFile(chosen);
    setSaved(false);
    clearError();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    clearError();
    setSaved(false);

    if (file.size > SIGNATURE_MAX_BYTES) {
      showError('mySignature.tooLargeError');
      return;
    }
    if (!SIGNATURE_TYPES.includes(file.type)) {
      showError('mySignature.unsupportedError');
      return;
    }

    setUploading(true);
    try {
      const status = await uploadOwnSignature(file);
      setHasSignature(status.hasSignature);
      // Never the same as before, even within one millisecond.
      setVersion((current) => Math.max(Date.now(), current + 1));
      setImageFailed(false);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setSaved(true);
    } catch (uploadError) {
      showError(uploadErrorKey(uploadError));
    } finally {
      setUploading(false);
    }
  }

  const showPreview = hasSignature && !imageFailed;

  return (
    <main>
      <PageHeader title={t('mySignature.title')} />
      {loadState === 'loading' && (
        <p className="sf-empty" data-testid="my-signature-loading">
          {t('mySignature.loading')}
        </p>
      )}
      {loadState === 'error' && (
        <p className="sf-empty" data-testid="my-signature-error-state">
          {t('mySignature.errorState')}
        </p>
      )}
      {loadState === 'loaded' && (
        <section className="sf-panel" aria-label={t('mySignature.title')}>
          {showPreview ? (
            <img
              className="sf-logo-preview"
              src={ownSignatureImageUrl(version)}
              alt={t('mySignature.alt')}
              onError={() => setImageFailed(true)}
              data-testid="my-signature-preview"
            />
          ) : (
            <p className="sf-empty" data-testid="my-signature-empty">
              {t(imageFailed ? 'mySignature.loadError' : 'mySignature.none')}
            </p>
          )}
          <StatusRegion>
            {saved && (
              <Alert
                tone="success"
                testId="my-signature-success"
                message={t('mySignature.uploadSuccess')}
              />
            )}
          </StatusRegion>
          <form className="sf-form" onSubmit={handleSubmit} noValidate>
            <div className="sf-field">
              <label htmlFor="my-signature-input">{t('mySignature.fileLabel')}</label>
              <input
                ref={inputRef}
                id="my-signature-input"
                type="file"
                accept={SIGNATURE_TYPES.join(',')}
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                disabled={uploading}
                data-testid="my-signature-input"
              />
            </div>
            {error && (
              <Alert
                key={errorAlertKey}
                tone="danger"
                testId="my-signature-error"
                message={t(error)}
              />
            )}
            <div className="sf-actions">
              <button
                type="submit"
                className="sf-btn sf-btn-primary"
                disabled={!file || uploading}
                data-testid="my-signature-upload"
              >
                {t('mySignature.uploadLabel')}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

// Branches on status and code only, never on the server's message text.
function uploadErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError && error.status === HTTP_PAYLOAD_TOO_LARGE) {
    return 'mySignature.tooLargeError';
  }
  if (error instanceof ApiError && error.code === UNSUPPORTED_FORMAT) {
    return 'mySignature.unsupportedError';
  }
  return 'mySignature.uploadError';
}
