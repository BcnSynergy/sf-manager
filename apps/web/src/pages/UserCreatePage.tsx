import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { createUserSchema, isMaintenanceRole, roleSchema, type Role } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { listMaintenanceCompanies, type MaintenanceCompany } from '../api/maintenance-company';
import { createUser } from '../api/users';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';
import { mapApiErrorToMessageKey } from '../users/error-messages';
import { mapRoleToLabelKey } from '../users/role-labels';

const ROLE_OPTIONS = roleSchema.options;
const DEFAULT_ROLE: Role = 'SYSTEM_ADMIN';

type FieldName = 'email' | 'password' | 'maintenanceCompanyId';

// EN-193: the schema's issue messages are hard-coded English, so each
// failing field maps to its own i18n key by the issue's path, never by
// showing the issue's message.
const FIELD_ERROR_KEYS: Record<FieldName, string> = {
  email: 'users.create.emailError',
  password: 'users.create.passwordRules',
  maintenanceCompanyId: 'users.create.companyError',
};

function failingFields(issues: readonly { path: readonly PropertyKey[] }[]): Set<FieldName> {
  const fields = new Set<FieldName>();
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === 'email' || field === 'password' || field === 'maintenanceCompanyId') {
      fields.add(field);
    }
  }
  return fields;
}

// spec.md "Create User": client-side validation against the shared
// createUserSchema/passwordSchema MUST run before any network request
// (ADR-015 single source of truth, mirrors LoginPage.tsx's pattern). On
// success the caller is sent back to /users, which refetches the list on
// mount — "appears in the list without a manual reload" per the spec.
// Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "No Server-Message String Coupling"); this
// page never reads ApiError.message.
//
// maintenance-company user-admin-ui spec "Role-Conditional Company
// Selector" / design.md Decision 7: the company `<select>` is populated
// from GET /maintenance-companies, fetched once on mount (there is no
// existing id to resolve on a create form, unlike UserEditPage/
// UsersListPage — just the dropdown's options), and appears/is required
// only while `isMaintenanceRole(role)` — the single source of truth shared
// with @sf-manager/validation's `.superRefine` and the domain policy.
// Switching away from a maintenance role clears the selection so a stale
// `maintenanceCompanyId` can never linger in the submitted payload, which
// is itself built conditionally on the CURRENT role, never on stale state.
export function UserCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState<MaintenanceCompany[]>([]);
  const {
    message: error,
    key: errorAlertKey,
    show: showError,
    clear: clearError,
  } = useAlertMessage();
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Set<FieldName>>(new Set());

  useEffect(() => {
    let cancelled = false;

    listMaintenanceCompanies()
      .then((result) => {
        if (!cancelled) {
          setCompanies(result);
        }
      })
      .catch(() => {
        // A failed company-list fetch just leaves the selector empty; the
        // required-field client validation still blocks submission for a
        // maintenance role with no company picked.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleRoleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextRole = event.target.value as Role;
    setRole(nextRole);
    if (!isMaintenanceRole(nextRole)) {
      setCompanyId('');
    }
  }

  const showCompanySelector = isMaintenanceRole(role);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const result = createUserSchema.safeParse({
      email,
      password,
      role,
      maintenanceCompanyId: showCompanySelector ? companyId : undefined,
    });
    if (!result.success) {
      setFieldErrors(failingFields(result.error.issues));
      showError('users.create.validationError');
      return;
    }
    setFieldErrors(new Set());

    setSubmitting(true);
    try {
      await createUser(result.data);
      navigate('/users');
    } catch (caughtError) {
      showError(
        mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0)),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <PageHeader title={t('users.create.title')} />
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <div className="sf-field">
          <label htmlFor="user-create-email-input">{t('users.create.emailLabel')}</label>
          <input
            id="user-create-email-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.has('email')}
            aria-describedby={fieldErrors.has('email') ? 'user-create-email-error' : undefined}
            data-testid="user-create-email"
          />
          {fieldErrors.has('email') && (
            <p
              id="user-create-email-error"
              className="sf-field-error"
              data-testid="user-create-email-error"
            >
              {t(FIELD_ERROR_KEYS.email)}
            </p>
          )}
        </div>
        <div className="sf-field">
          <label htmlFor="user-create-password-input">{t('users.create.passwordLabel')}</label>
          <input
            id="user-create-password-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.has('password')}
            aria-describedby="user-create-password-rules"
            data-testid="user-create-password"
          />
          {/* Same pattern as ResetPasswordPage: the rules are the hint, and
              once broken the same text becomes the field's error instead of
              appearing twice. */}
          {fieldErrors.has('password') ? (
            <p
              id="user-create-password-rules"
              className="sf-field-error"
              data-testid="user-create-password-error"
            >
              {t(FIELD_ERROR_KEYS.password)}
            </p>
          ) : (
            <small
              id="user-create-password-rules"
              className="sf-field-hint"
              data-testid="user-create-password-rules"
            >
              {t(FIELD_ERROR_KEYS.password)}
            </small>
          )}
        </div>
        <div className="sf-field">
          <label htmlFor="user-create-role-input">{t('users.create.roleLabel')}</label>
          <select
            id="user-create-role-input"
            value={role}
            onChange={handleRoleChange}
            data-testid="user-create-role"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(mapRoleToLabelKey(option))}
              </option>
            ))}
          </select>
        </div>
        {showCompanySelector && (
          <div className="sf-field">
            <label htmlFor="user-create-company-input">{t('users.create.companyLabel')}</label>
            <select
              id="user-create-company-input"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              required
              aria-invalid={fieldErrors.has('maintenanceCompanyId')}
              aria-describedby={
                fieldErrors.has('maintenanceCompanyId') ? 'user-create-company-error' : undefined
              }
              data-testid="user-create-company"
            >
              <option value="" disabled>
                {t('users.create.companyPlaceholder')}
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {fieldErrors.has('maintenanceCompanyId') && (
              <p
                id="user-create-company-error"
                className="sf-field-error"
                data-testid="user-create-company-error"
              >
                {t(FIELD_ERROR_KEYS.maintenanceCompanyId)}
              </p>
            )}
          </div>
        )}
        {error && (
          // The alert stores an i18n key, so it follows a language switch
          // like the field errors do (use-alert-message.ts).
          <Alert key={errorAlertKey} tone="danger" testId="user-create-error" message={t(error)} />
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            data-testid="user-create-submit"
            disabled={submitting}
          >
            {t('users.create.submitLabel')}
          </button>
        </div>
      </form>
    </main>
  );
}
