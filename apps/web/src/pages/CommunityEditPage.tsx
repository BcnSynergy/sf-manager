import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { updateCommunitySchema, localeSchema, type Locale } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { updateCommunity } from '../api/community';
import { mapApiErrorToMessageKey } from '../community/error-messages';
import { mapLocaleToLabelKey } from '../community/locale-labels';
import { useCommunity } from '../community/use-community';

const LOCALE_OPTIONS = localeSchema.options;

// spec.md "Edit Community": no `GET /communities/:id` exists (design.md
// Decision 4), so this page delegates to the shared useCommunity(id) hook —
// listCommunities() + client-side select by :id, with an explicit not-found
// state (no silent redirect) rather than duplicating that guardrail inline
// like UserEditPage.tsx does for its single-caller case. Client validation
// against updateCommunitySchema/localeSchema MUST run before any network
// request (ADR-015 single source of truth, mirrors CommunityCreatePage.tsx).
// Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "No Server-Message String Coupling"); this
// page never reads ApiError.message. The locale <select> renders its
// options through mapLocaleToLabelKey (spec "Enum Value Label Mapping").
export function CommunityEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { community, loadState } = useCommunity(id);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locale, setLocale] = useState<Locale>('en');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks which community's fields are currently reflected in the form
  // state, so a freshly-loaded community is synced exactly once. Adjusting
  // state during render (the React-docs-endorsed alternative to an effect
  // for "derive state from a changed prop/value") avoids the one-frame
  // flicker an effect-based sync would cause: useCommunity's `community` and
  // `loadState` become 'loaded' together in a single batched update, so
  // syncing here keeps the prefilled fields in that same render commit
  // instead of a following one.
  const [prefilledId, setPrefilledId] = useState<string | undefined>(undefined);
  if (community && community.id !== prefilledId) {
    setPrefilledId(community.id);
    setName(community.name);
    setAddress(community.address);
    setLocale(community.locale);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = updateCommunitySchema.safeParse({ name, address, locale });
    if (!result.success) {
      setError(t('community.edit.validationError'));
      return;
    }

    if (!id) {
      return;
    }

    setSubmitting(true);
    try {
      await updateCommunity(id, result.data);
      navigate('/communities');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('community.edit.title')}</h1>
        <p data-testid="community-edit-loading">{t('community.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('community.edit.title')}</h1>
        <p data-testid="community-edit-not-found">{t('community.edit.notFound')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('community.edit.title')}</h1>
        <p data-testid="community-edit-error-state">{t('common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('community.edit.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="community-edit-name-input">{t('community.edit.nameLabel')}</label>
        <input
          id="community-edit-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="community-edit-name"
        />
        <label htmlFor="community-edit-address-input">{t('community.edit.addressLabel')}</label>
        <input
          id="community-edit-address-input"
          type="text"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          data-testid="community-edit-address"
        />
        <label htmlFor="community-edit-locale-input">{t('community.edit.localeLabel')}</label>
        <select
          id="community-edit-locale-input"
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
          data-testid="community-edit-locale"
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapLocaleToLabelKey(option))}
            </option>
          ))}
        </select>
        {error && <p data-testid="community-edit-error">{error}</p>}
        <button type="submit" data-testid="community-edit-submit" disabled={submitting}>
          {t('community.edit.submitLabel')}
        </button>
      </form>
    </main>
  );
}
