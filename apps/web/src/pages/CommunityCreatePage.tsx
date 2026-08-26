import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { createCommunitySchema, localeSchema, type Locale } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createCommunity } from '../api/community';
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = createCommunitySchema.safeParse({ name, address, locale });
    if (!result.success) {
      setError(t('community.create.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      await createCommunity(result.data);
      navigate('/communities');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{t('community.create.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="community-create-name-input">{t('community.create.nameLabel')}</label>
        <input
          id="community-create-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="community-create-name"
        />
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
        {error && <p data-testid="community-create-error">{error}</p>}
        <button type="submit" data-testid="community-create-submit" disabled={submitting}>
          {t('community.create.submitLabel')}
        </button>
      </form>
    </main>
  );
}
