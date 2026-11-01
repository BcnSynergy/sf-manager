import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  organizationLogoUrl,
  removeOrganizationLogo,
  uploadOrganizationLogo,
  type OrganizationProfileErrorCode,
} from '../api/organization-profile';
import { Alert, StatusRegion } from '../components/Alert';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAlertMessage } from '../components/use-alert-message';

// organization-logo S2: the API's own limits, checked here first so an
// obviously wrong file never costs a request. The API still decides by the
// file's content, so a mislabelled file is caught there.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

const HTTP_PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_FORMAT: OrganizationProfileErrorCode = 'LOGO_UNSUPPORTED_FORMAT';

type Props = {
  // From the profile read: whether a logo exists when the page loads.
  hasLogo: boolean;
};

// The logo has its own upload, separate from the profile's Save: a file is
// sent the moment the admin clicks Upload, and the text fields are not
// touched. The preview is an <img> on the logo endpoint; `version` gives it a
// new URL on each mount and after each upload so the browser fetches the
// current image. If the
// image fails to load (for example its file was lost), the preview gives
// way to a message instead of a broken image.
//
// EN-110: Remove, shown whenever the profile records a logo (also when its
// image fails to load), asks for confirmation first. The section's one
// status region confirms either an upload or a removal.
export function OrganizationLogoSection({ hasLogo: initialHasLogo }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const refocusRemoveRef = useRef(false);
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  // EN-127: taken from the clock, on mount and after each upload. The admin
  // moves between the profile and this page without a reload, so a counter
  // restarting at 0 would repeat URLs the browser already holds for older
  // images.
  const [version, setVersion] = useState(() => Date.now());
  const [imageFailed, setImageFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const {
    message: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();

  function handleFileChange(chosen: File | null) {
    setFile(chosen);
    setSuccessKey(null);
    clearError();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    clearError();
    setSuccessKey(null);

    if (file.size > LOGO_MAX_BYTES) {
      showError(t('organizationProfile.logoTooLargeError'));
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      showError(t('organizationProfile.logoUnsupportedError'));
      return;
    }

    setUploading(true);
    try {
      const profile = await uploadOrganizationLogo(file);
      setHasLogo(profile.hasLogo);
      setVersion(Date.now());
      setImageFailed(false);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setSuccessKey('organizationProfile.logoUploadSuccess');
    } catch (uploadError) {
      showError(t(uploadErrorKey(uploadError)));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setConfirmingRemoval(false);
    clearError();
    setSuccessKey(null);
    setRemoving(true);
    try {
      const profile = await removeOrganizationLogo();
      setHasLogo(profile.hasLogo);
      setImageFailed(false);
      setSuccessKey('organizationProfile.logoRemoveSuccess');
      // The Remove button that had focus is gone; keep the keyboard user
      // in the section.
      headingRef.current?.focus();
    } catch {
      showError(t('organizationProfile.logoRemoveError'));
      refocusRemoveRef.current = true;
    } finally {
      setRemoving(false);
    }
  }

  // After a failed removal the Remove button is still there, but it was
  // disabled when the dialog handed focus back to it; focus it once it is
  // enabled again.
  useEffect(() => {
    if (!removing && refocusRemoveRef.current) {
      refocusRemoveRef.current = false;
      removeRef.current?.focus();
    }
  }, [removing]);

  const busy = uploading || removing;
  const showPreview = hasLogo && !imageFailed;

  return (
    <section className="sf-panel" aria-labelledby="organization-logo-title">
      <h2 ref={headingRef} id="organization-logo-title" className="sf-section-title" tabIndex={-1}>
        {t('organizationProfile.logoTitle')}
      </h2>
      {showPreview ? (
        <img
          className="sf-logo-preview"
          src={organizationLogoUrl(version)}
          alt={t('organizationProfile.logoAlt')}
          onError={() => setImageFailed(true)}
          data-testid="organization-logo-preview"
        />
      ) : (
        <p className="sf-empty" data-testid="organization-logo-empty">
          {t(imageFailed ? 'organizationProfile.logoLoadError' : 'organizationProfile.noLogo')}
        </p>
      )}
      <StatusRegion>
        {successKey && (
          <Alert tone="success" testId="organization-logo-success" message={t(successKey)} />
        )}
      </StatusRegion>
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <div className="sf-field">
          <label htmlFor="organization-logo-input">{t('organizationProfile.logoFileLabel')}</label>
          <input
            ref={inputRef}
            id="organization-logo-input"
            type="file"
            accept={LOGO_TYPES.join(',')}
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            disabled={busy}
            data-testid="organization-logo-input"
          />
        </div>
        {error && (
          <Alert
            key={errorAlertKey}
            tone="danger"
            testId="organization-logo-error"
            message={error}
          />
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            disabled={!file || busy}
            data-testid="organization-logo-upload"
          >
            {t('organizationProfile.logoUploadLabel')}
          </button>
          {hasLogo && (
            <button
              ref={removeRef}
              type="button"
              className="sf-btn sf-btn-danger"
              onClick={() => setConfirmingRemoval(true)}
              disabled={busy}
              data-testid="organization-logo-remove"
            >
              {t('organizationProfile.logoRemoveLabel')}
            </button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={confirmingRemoval}
        title={t('organizationProfile.logoRemoveConfirmTitle')}
        message={t('organizationProfile.logoRemoveConfirmMessage')}
        confirmLabel={t('organizationProfile.logoRemoveLabel')}
        tone="danger"
        onConfirm={() => void handleRemove()}
        onCancel={() => setConfirmingRemoval(false)}
      />
    </section>
  );
}

// Branches on status and code only, never on the server's message text
// (organization-profile-admin-ui, "No Server-Message String Coupling").
function uploadErrorKey(error: unknown): string {
  if (error instanceof ApiError && error.status === HTTP_PAYLOAD_TOO_LARGE) {
    return 'organizationProfile.logoTooLargeError';
  }
  if (error instanceof ApiError && error.code === UNSUPPORTED_FORMAT) {
    return 'organizationProfile.logoUnsupportedError';
  }
  return 'organizationProfile.logoUploadError';
}
