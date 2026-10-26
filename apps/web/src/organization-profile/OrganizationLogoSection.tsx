import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  organizationLogoUrl,
  uploadOrganizationLogo,
  type OrganizationProfileErrorCode,
} from '../api/organization-profile';
import { Alert, StatusRegion } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';

// organization-logo S2: the API's own limits, checked here first so an
// obviously wrong file never costs a request. The API still decides by the
// file's content, so a mislabelled file is caught there.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const HTTP_PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_FORMAT: OrganizationProfileErrorCode = 'LOGO_UNSUPPORTED_FORMAT';

type Props = {
  // From the profile read: whether a logo exists when the page loads.
  hasLogo: boolean;
};

// The logo has its own upload, separate from the profile's Save: a file is
// sent the moment the admin clicks Upload, and the text fields are not
// touched. The preview is an <img> on the logo endpoint; `version` changes
// its URL after each upload so the browser fetches the new image. If the
// image fails to load (for example its file was lost), the preview gives
// way to a message instead of a broken image.
export function OrganizationLogoSection({ hasLogo: initialHasLogo }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  const [version, setVersion] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const {
    message: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();

  function handleFileChange(chosen: File | null) {
    setFile(chosen);
    setSuccess(false);
    clearError();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    clearError();
    setSuccess(false);

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
      setVersion((current) => current + 1);
      setImageFailed(false);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setSuccess(true);
    } catch (uploadError) {
      showError(t(uploadErrorKey(uploadError)));
    } finally {
      setUploading(false);
    }
  }

  const showPreview = hasLogo && !imageFailed;

  return (
    <section className="sf-panel" aria-labelledby="organization-logo-title">
      <h2 id="organization-logo-title" className="sf-section-title">
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
        {success && (
          <Alert
            tone="success"
            testId="organization-logo-success"
            message={t('organizationProfile.logoUploadSuccess')}
          />
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
            disabled={uploading}
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
            disabled={!file || uploading}
            data-testid="organization-logo-upload"
          >
            {t('organizationProfile.logoUploadLabel')}
          </button>
        </div>
      </form>
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
