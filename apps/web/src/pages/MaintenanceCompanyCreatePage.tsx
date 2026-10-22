import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { createMaintenanceCompanySchema } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createMaintenanceCompany } from '../api/maintenance-company';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';
import { mapApiErrorToMessageKey } from '../maintenance-company/error-messages';

// spec.md "Create Maintenance Company": client-side validation against the
// shared createMaintenanceCompanySchema MUST run before any network request
// (ADR-015 single source of truth, mirrors CommunityCreatePage.tsx's
// pattern). On success the caller is sent back to /maintenance-companies,
// which refetches the list on mount — "appears in the list without a manual
// reload" per the spec. Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "No Server-Message String Coupling" +
// "Duplicate taxId shows a specific message"); this page never reads
// ApiError.message.
export function MaintenanceCompanyCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const result = createMaintenanceCompanySchema.safeParse({ name, taxId, contactInfo });
    if (!result.success) {
      showError(t('maintenanceCompany.create.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      await createMaintenanceCompany(result.data);
      navigate('/maintenance-companies');
    } catch (caughtError) {
      showError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <PageHeader title={t('maintenanceCompany.create.title')} />
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <div className="sf-field">
          <label htmlFor="maintenance-company-create-name-input">
            {t('maintenanceCompany.create.nameLabel')}
          </label>
          <input
            id="maintenance-company-create-name-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="maintenance-company-create-name"
          />
        </div>
        <div className="sf-field">
          <label htmlFor="maintenance-company-create-tax-id-input">
            {t('maintenanceCompany.create.taxIdLabel')}
          </label>
          <input
            id="maintenance-company-create-tax-id-input"
            type="text"
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
            data-testid="maintenance-company-create-tax-id"
          />
        </div>
        <div className="sf-field">
          <label htmlFor="maintenance-company-create-contact-info-input">
            {t('maintenanceCompany.create.contactInfoLabel')}
          </label>
          <input
            id="maintenance-company-create-contact-info-input"
            type="text"
            value={contactInfo}
            onChange={(event) => setContactInfo(event.target.value)}
            data-testid="maintenance-company-create-contact-info"
          />
        </div>
        {error && (
          <Alert
            key={errorAlertKey}
            tone="danger"
            testId="maintenance-company-create-error"
            message={error}
          />
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            data-testid="maintenance-company-create-submit"
            disabled={submitting}
          >
            {t('maintenanceCompany.create.submitLabel')}
          </button>
        </div>
      </form>
    </main>
  );
}
