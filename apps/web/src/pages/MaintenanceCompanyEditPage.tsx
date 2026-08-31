import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { updateMaintenanceCompanySchema } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  listMaintenanceCompanies,
  softDeleteMaintenanceCompany,
  updateMaintenanceCompany,
} from '../api/maintenance-company';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapApiErrorToMessageKey } from '../maintenance-company/error-messages';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// spec.md "Edit Maintenance Company" / "Soft-Delete Maintenance Company" /
// "Cause-Specific Delete-Block Messaging". No `GET /maintenance-companies/:id`
// exists (design.md Decision 2/Routes table), and — unlike `community`, which
// has a detail page that also needs the fetch — this is the ONLY caller that
// needs to resolve :id, so the list-and-select is inlined here rather than
// extracted into a shared hook, mirroring UserEditPage.tsx's single-caller
// precedent (see CommunityEditPage.tsx's own comment contrasting the two).
//
// Unlike `community`, whose confirmed soft-delete lives on the LIST page
// (CommunitiesListPage.tsx), this slice puts it on the edit page instead
// (tasks.md Phase 10, 10.1) since there is no company detail page and the
// spec scopes list to view-only (no per-row destructive action). Delete and
// save are two independent actions with two independent error surfaces:
// a failed save (e.g. duplicate taxId) must never be conflated with a
// failed delete (e.g. active users attached) — spec "Cause-Specific
// Delete-Block Messaging" requires the two to be distinguishable, and
// mapApiErrorToMessageKey already gives each `code` its own key
// (duplicateTaxId vs. hasActiveUsers), so this page just needs to render
// them into two separate error slots rather than one shared `error` state.
export function MaintenanceCompanyEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listMaintenanceCompanies()
      .then((companies) => {
        if (cancelled) {
          return;
        }
        const found = companies.find((candidate) => candidate.id === id);
        if (!found) {
          setLoadState('not-found');
          return;
        }
        setName(found.name);
        setTaxId(found.taxId);
        setContactInfo(found.contactInfo);
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
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = updateMaintenanceCompanySchema.safeParse({ name, taxId, contactInfo });
    if (!result.success) {
      setError(t('maintenanceCompany.edit.validationError'));
      return;
    }

    if (!id) {
      return;
    }

    setSubmitting(true);
    try {
      await updateMaintenanceCompany(id, result.data);
      navigate('/maintenance-companies');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  function requestDelete() {
    setDeleteError(null);
    setPendingDelete(true);
  }

  async function confirmDelete() {
    setPendingDelete(false);
    if (!id) {
      return;
    }

    setDeleting(true);
    try {
      await softDeleteMaintenanceCompany(id);
      navigate('/maintenance-companies');
    } catch (caughtError) {
      setDeleteError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setDeleting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('maintenanceCompany.edit.title')}</h1>
        <p data-testid="maintenance-company-edit-loading">{t('maintenanceCompany.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('maintenanceCompany.edit.title')}</h1>
        <p data-testid="maintenance-company-edit-not-found">
          {t('maintenanceCompany.edit.notFound')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('maintenanceCompany.edit.title')}</h1>
        <p data-testid="maintenance-company-edit-error-state">{t('common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('maintenanceCompany.edit.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="maintenance-company-edit-name-input">
          {t('maintenanceCompany.edit.nameLabel')}
        </label>
        <input
          id="maintenance-company-edit-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="maintenance-company-edit-name"
        />
        <label htmlFor="maintenance-company-edit-tax-id-input">
          {t('maintenanceCompany.edit.taxIdLabel')}
        </label>
        <input
          id="maintenance-company-edit-tax-id-input"
          type="text"
          value={taxId}
          onChange={(event) => setTaxId(event.target.value)}
          data-testid="maintenance-company-edit-tax-id"
        />
        <label htmlFor="maintenance-company-edit-contact-info-input">
          {t('maintenanceCompany.edit.contactInfoLabel')}
        </label>
        <input
          id="maintenance-company-edit-contact-info-input"
          type="text"
          value={contactInfo}
          onChange={(event) => setContactInfo(event.target.value)}
          data-testid="maintenance-company-edit-contact-info"
        />
        {error && <p data-testid="maintenance-company-edit-error">{error}</p>}
        <button
          type="submit"
          data-testid="maintenance-company-edit-submit"
          disabled={submitting || deleting}
        >
          {t('maintenanceCompany.edit.submitLabel')}
        </button>
      </form>
      {deleteError && (
        <p data-testid="maintenance-company-edit-delete-error">{deleteError}</p>
      )}
      <button
        type="button"
        data-testid="maintenance-company-edit-delete"
        disabled={submitting || deleting}
        onClick={requestDelete}
      >
        {t('maintenanceCompany.edit.deleteLabel')}
      </button>
      <ConfirmDialog
        open={pendingDelete}
        title={t('maintenanceCompany.edit.deleteConfirmTitle')}
        message={t('maintenanceCompany.edit.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(false)}
      />
    </main>
  );
}
