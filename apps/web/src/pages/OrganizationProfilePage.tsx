import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { updateOrganizationProfileSchema } from '@sf-manager/validation';
import {
  getOrganizationProfile,
  updateOrganizationProfile,
  type OrganizationProfile,
  type UpdateOrganizationProfilePayload,
} from '../api/organization-profile';
import { PageHeader } from '../components/PageHeader';
import { Alert, StatusRegion } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';
import { isProfileIncomplete } from '../organization-profile/is-profile-incomplete';
import { OrganizationLogoSection } from '../organization-profile/OrganizationLogoSection';

type LoadState = 'loading' | 'loaded' | 'error';

type ProfileFieldKey = 'name' | 'legalName' | 'taxId' | 'address' | 'phone' | 'email';

const REQUIRED_FIELDS: ProfileFieldKey[] = [
  'name',
  'legalName',
  'taxId',
  'address',
  'phone',
  'email',
];

const EMPTY_PROFILE: Record<ProfileFieldKey, string> = {
  name: '',
  legalName: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
};

function toFieldValues(profile: OrganizationProfile): Record<ProfileFieldKey, string> {
  return {
    name: profile.name,
    legalName: profile.legalName,
    taxId: profile.taxId,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
  };
}

// spec.md "One Combined View and Edit Page" — no create/delete/list
// affordance exists; this is the whole surface. The logo has its own section
// below the form, with its own upload (organization-logo).
//
// design.md Decision 5: `incomplete` is derived from `saved` — the last
// server-confirmed snapshot — never from the live `values` the admin is
// typing, so the banner does not flicker while editing and only clears once
// a save actually lands.
//
// design.md Decision 5 + spec.md "A Blank Field Is Rejected Before Any
// Network Call": a field that is blank in `values` but was blank in `saved`
// too (never filled) is simply OMITTED from the PATCH payload — allowing a
// partial fill of the blank seeded profile. A field that is blank in
// `values` but held a value in `saved` (the admin just cleared it) is
// rejected client-side with no network call — clearing a field in the UI
// cannot blank it in the database (design.md "Two further page-level
// consequences").
//
// Inputs are disabled while `submitting` (unlike MaintenanceCompanyEditPage/
// UserEditPage, which only disable their submit button). Those pages
// navigate() away on a successful save, so the form unmounts before a
// conflicting edit could ever land; this page deliberately stays mounted
// (Decision 5, "No navigate() after save"), so a successful PATCH response
// overwrites `values`/`saved` with the server snapshot while still on
// screen. Without disabling inputs, an admin could type into a DIFFERENT
// field while the request is in flight and have that edit silently
// discarded the moment the response resolves — this closes that window
// instead of trying to merge around it.
export function OrganizationProfilePage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [values, setValues] = useState<Record<ProfileFieldKey, string>>(EMPTY_PROFILE);
  const [saved, setSaved] = useState<Record<ProfileFieldKey, string>>(EMPTY_PROFILE);
  const [hasLogo, setHasLogo] = useState(false);
  const {
    message: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();
  const [submitting, setSubmitting] = useState(false);
  // design.md Decision 5, "The page stays put and shows a success
  // indication.": there is no navigate() to serve as an implicit
  // confirmation (Decision 5, "No navigate() after save"), so on an
  // already-complete profile — where the incomplete banner is already
  // absent — a successful save otherwise leaves zero visible feedback.
  // Cleared on the next edit (handleChange) so it cannot go stale while the
  // admin keeps working, mirroring how `error` is cleared at the start of
  // the next submit.
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getOrganizationProfile()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        const fieldValues = toFieldValues(profile);
        setValues(fieldValues);
        setSaved(fieldValues);
        setHasLogo(profile.hasLogo);
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const incomplete = isProfileIncomplete(saved);

  function handleChange(field: ProfileFieldKey, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setSuccess(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setSuccess(false);

    const payload: UpdateOrganizationProfilePayload = {};
    let clearedAnExistingValue = false;

    for (const field of REQUIRED_FIELDS) {
      const trimmed = values[field].trim();
      if (trimmed !== '') {
        payload[field] = trimmed;
      } else if (saved[field] !== '') {
        clearedAnExistingValue = true;
      }
    }

    if (clearedAnExistingValue) {
      showError(t('organizationProfile.clearedFieldError'));
      return;
    }

    if (Object.keys(payload).length === 0) {
      showError(t('organizationProfile.emptySubmitError'));
      return;
    }

    const result = updateOrganizationProfileSchema.safeParse(payload);
    if (!result.success) {
      showError(t('organizationProfile.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateOrganizationProfile(result.data);
      const fieldValues = toFieldValues(updated);
      setValues(fieldValues);
      setSaved(fieldValues);
      setSuccess(true);
    } catch {
      showError(t('organizationProfile.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('organizationProfile.title')} />
        <p className="sf-empty" data-testid="organization-profile-loading">
          {t('organizationProfile.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <PageHeader title={t('organizationProfile.title')} />
        <p className="sf-empty" data-testid="organization-profile-error-state">
          {t('organizationProfile.errorState')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('organizationProfile.title')} />
      {incomplete && (
        <div className="sf-alert" data-testid="organization-profile-incomplete">
          <span className="sf-alert-icon" aria-hidden="true">
            i
          </span>
          <p>{t('organizationProfile.incomplete')}</p>
        </div>
      )}
      <StatusRegion>
        {success && (
          <Alert
            tone="success"
            testId="organization-profile-success"
            message={t('organizationProfile.saveSuccess')}
          />
        )}
      </StatusRegion>
      {/* noValidate: validation messages are ours, not the browser's native,
          locale-inconsistent constraint-validation UI. */}
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        {REQUIRED_FIELDS.map((field) => (
          <div key={field} className="sf-field">
            <label htmlFor={`organization-profile-${field}-input`}>
              {t(`organizationProfile.${field}Label`)}
            </label>
            <input
              id={`organization-profile-${field}-input`}
              type={field === 'email' ? 'email' : 'text'}
              value={values[field]}
              onChange={(event) => handleChange(field, event.target.value)}
              disabled={submitting}
              data-testid={`organization-profile-${toTestIdSegment(field)}`}
            />
          </div>
        ))}
        {error && (
          <Alert
            key={errorAlertKey}
            tone="danger"
            testId="organization-profile-error"
            message={error}
          />
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            data-testid="organization-profile-submit"
            disabled={submitting}
          >
            {t('organizationProfile.submitLabel')}
          </button>
        </div>
      </form>
      <OrganizationLogoSection hasLogo={hasLogo} />
    </main>
  );
}

// legalName -> legal-name, taxId -> tax-id; the rest are already single
// words. Kept local and tiny rather than pulling in a casing dependency for
// six known field names.
function toTestIdSegment(field: ProfileFieldKey): string {
  return field.replace(/([A-Z])/g, '-$1').toLowerCase();
}
