import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { createCommunitySchema, localeSchema, type Locale } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createCommunity } from '../api/community';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';
import { mapApiErrorToMessageKey } from '../community/error-messages';
import { mapLocaleToLabelKey } from '../community/locale-labels';

const LOCALE_OPTIONS = localeSchema.options;
const DEFAULT_LOCALE: Locale = 'en';

// spec.md "Create Community": client-side validation against the shared
// createCommunitySchema/localeSchema MUST run before any network request
// (ADR-015 single source of truth, mirrors UserCreatePage.tsx's pattern). On
// success the caller is sent back to /communities, which refetches the list
// on mount — "appears in the list without a manual reload" per the spec.
// Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "No Server-Message String Coupling"); this
// page never reads ApiError.message. The locale <select> renders its
// options through mapLocaleToLabelKey (spec "Enum Value Label Mapping") —
// the raw enum value only backs <option value>.
export function CommunityCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const {
    message: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const result = createCommunitySchema.safeParse({ name, address, locale });
    if (!result.success) {
      showError(t('community.create.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      await createCommunity(result.data);
      navigate('/communities');
    } catch (caughtError) {
      showError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <PageHeader title={t('community.create.title')} />
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <div className="sf-field">
          <label htmlFor="community-create-name-input">{t('community.create.nameLabel')}</label>
          <input
            id="community-create-name-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="community-create-name"
          />
        </div>
        <div className="sf-field">
          <label htmlFor="community-create-address-input">
            {t('community.create.addressLabel')}
          </label>
          <input
            id="community-create-address-input"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            data-testid="community-create-address"
          />
        </div>
        <div className="sf-field">
          <label htmlFor="community-create-locale-input">{t('community.create.localeLabel')}</label>
          <select
            id="community-create-locale-input"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            data-testid="community-create-locale"
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(mapLocaleToLabelKey(option))}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <Alert
            key={errorAlertKey}
            tone="danger"
            testId="community-create-error"
            message={error}
          />
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            data-testid="community-create-submit"
            disabled={submitting}
          >
            {t('community.create.submitLabel')}
          </button>
        </div>
      </form>
    </main>
  );
}
