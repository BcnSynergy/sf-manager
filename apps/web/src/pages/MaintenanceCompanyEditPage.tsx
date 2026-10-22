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
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';
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
  const {
    message: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const {
    message: deleteError,
    key: deleteErrorAlertKey,
    show: showDeleteError,
    clear: clearDeleteError,
  } = useAlertMessage();
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
    clearError();

    const result = updateMaintenanceCompanySchema.safeParse({ name, taxId, contactInfo });
    if (!result.success) {
      showError(t('maintenanceCompany.edit.validationError'));
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
      showError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  function requestDelete() {
    clearDeleteError();
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
      showDeleteError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setDeleting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('maintenanceCompany.edit.title')} />
        <p className="sf-empty" data-testid="maintenance-company-edit-loading">
          {t('maintenanceCompany.list.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <PageHeader title={t('maintenanceCompany.edit.title')} />
        <p className="sf-empty" data-testid="maintenance-company-edit-not-found">
          {t('maintenanceCompany.edit.notFound')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <PageHeader title={t('maintenanceCompany.edit.title')} />
        <p className="sf-empty" data-testid="maintenance-company-edit-error-state">
          {t('common.error.network')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('maintenanceCompany.edit.title')} />
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <div className="sf-field">
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
        </div>
        <div className="sf-field">
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
        </div>
        <div className="sf-field">
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
        </div>
        {error && (
          <Alert
            key={errorAlertKey}
            tone="danger"
            testId="maintenance-company-edit-error"
            message={error}
          />
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            data-testid="maintenance-company-edit-submit"
            disabled={submitting || deleting}
          >
            {t('maintenanceCompany.edit.submitLabel')}
          </button>
        </div>
      </form>
      {/* EN-74: the page actions follow the form, so the fields come first in
          tab order; their failures show just above them. */}
      {deleteError && (
        <Alert
          key={deleteErrorAlertKey}
          tone="danger"
          testId="maintenance-company-edit-delete-error"
          message={deleteError}
        />
      )}
      <div className="sf-actions">
        <button
          type="button"
          className="sf-btn sf-btn-danger"
          data-testid="maintenance-company-edit-delete"
          disabled={submitting || deleting}
          onClick={requestDelete}
        >
          {t('maintenanceCompany.edit.deleteLabel')}
        </button>
      </div>
      <ConfirmDialog
        tone="danger"
        open={pendingDelete}
        title={t('maintenanceCompany.edit.deleteConfirmTitle')}
        message={t('maintenanceCompany.edit.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(false)}
      />
    </main>
  );
}
