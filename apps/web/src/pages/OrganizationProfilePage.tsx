import { useEffect, useState, type FormEvent } from 'react';
import { updateOrganizationProfileSchema } from '@sf-manager/validation';
import {
  getOrganizationProfile,
  updateOrganizationProfile,
  type OrganizationProfile,
  type UpdateOrganizationProfilePayload,
} from '../api/organization-profile';

// i18n note (Phase 6, tasks.md 6.2): every visible string below is a literal
// English placeholder, NOT an i18n violation being introduced silently —
// PR5's scope is explicitly web-core-only (tasks.md Phase 5), and Phase 6
// is the one that replaces these with real `organizationProfile.*` keys
// across en/es/ca (spec.md "Internationalization Coverage"). Flagged here so
// the omission is traceable, not discovered at verify time.

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

const FIELD_LABELS: Record<ProfileFieldKey, string> = {
  name: 'Name',
  legalName: 'Legal name',
  taxId: 'Tax ID',
  address: 'Address',
  phone: 'Phone',
  email: 'Email',
};

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
// affordance exists; this is the whole surface.
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
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [values, setValues] = useState<Record<ProfileFieldKey, string>>(EMPTY_PROFILE);
  const [saved, setSaved] = useState<Record<ProfileFieldKey, string>>(EMPTY_PROFILE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const incomplete = REQUIRED_FIELDS.some((field) => saved[field] === '');

  function handleChange(field: ProfileFieldKey, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
      setError('A field that already has a saved value cannot be cleared. Change it instead.');
      return;
    }

    if (Object.keys(payload).length === 0) {
      setError('Enter at least one value before saving.');
      return;
    }

    const result = updateOrganizationProfileSchema.safeParse(payload);
    if (!result.success) {
      setError('Please enter a valid value for each field you changed.');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateOrganizationProfile(result.data);
      const fieldValues = toFieldValues(updated);
      setValues(fieldValues);
      setSaved(fieldValues);
    } catch {
      setError('Could not save the organization profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>Organization Profile</h1>
        <p data-testid="organization-profile-loading">Loading…</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>Organization Profile</h1>
        <p data-testid="organization-profile-error-state">
          Could not load the organization profile. Please try again.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Organization Profile</h1>
      {incomplete && (
        <p data-testid="organization-profile-incomplete">
          This profile is not completed yet — fill in every field below.
        </p>
      )}
      {/* noValidate: validation messages are ours, not the browser's native,
          locale-inconsistent constraint-validation UI. */}
      <form onSubmit={handleSubmit} noValidate>
        {REQUIRED_FIELDS.map((field) => (
          <div key={field}>
            <label htmlFor={`organization-profile-${field}-input`}>{FIELD_LABELS[field]}</label>
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
        {error && <p data-testid="organization-profile-error">{error}</p>}
        <button type="submit" data-testid="organization-profile-submit" disabled={submitting}>
          Save
        </button>
      </form>
    </main>
  );
}

// legalName -> legal-name, taxId -> tax-id; the rest are already single
// words. Kept local and tiny rather than pulling in a casing dependency for
// six known field names.
function toTestIdSegment(field: ProfileFieldKey): string {
  return field.replace(/([A-Z])/g, '-$1').toLowerCase();
}
