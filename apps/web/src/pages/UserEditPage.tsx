import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { updateUserSchema, isMaintenanceRole, roleSchema, type Role } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { listMaintenanceCompanies, type MaintenanceCompany } from '../api/maintenance-company';
import { listUsers, updateUser } from '../api/users';
import { useAuth } from '../auth/AuthProvider';
import { mapApiErrorToMessageKey } from '../users/error-messages';
import { mapRoleToLabelKey } from '../users/role-labels';

const ROLE_OPTIONS = roleSchema.options;

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// spec.md "Edit User": no `GET /users/:id` exists (design.md Decision 5), so
// the page fetches listUsers() and selects the row by :id client-side. If
// the id is genuinely absent from a successfully-fetched list (deactivated
// or gone), the page renders a not-found state, per Decision 5's "no silent
// redirect". If listUsers() itself rejects (network/API failure), that's a
// distinct 'error' state — telling an admin a real user "could not be
// found" during a transient failure would be misleading — reusing
// mapApiErrorToMessageKey's network-error key (spec "No Server-Message
// String Coupling"). Only email and role are editable, no password field
// (spec). The role field is disabled on the admin's own row, mirroring
// UsersListPage's deactivate-button self-guard (design.md "Data Flow —
// deactivate"). Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey; this page never reads ApiError.message.
//
// maintenance-company user-admin-ui spec "Role-Conditional Company
// Selector" / "Maintenance Company Rendered By Name" / design.md
// Decision 7: the company list is fetched once on mount, in parallel with
// (never sequential to) listUsers() — neither effect awaits the other. The
// selector appears/is required only while `isMaintenanceRole(role)` and is
// preselected to the found row's `maintenanceCompanyId`, displayed by name
// via the `<option>` labels sourced from the same fetched list. This page
// always submits email+role in full (existing pattern), and now also always
// submits `maintenanceCompanyId` whenever the CURRENT role is
// maintenance-side — never a stale value carried over from before a role
// change away from maintenance, which clears the selection immediately.
export function UserEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('SYSTEM_ADMIN');
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState<MaintenanceCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listUsers()
      .then((users) => {
        if (cancelled) {
          return;
        }
        const found = users.find((candidate) => candidate.id === id);
        if (!found) {
          setLoadState('not-found');
          return;
        }
        setEmail(found.email);
        setRole(found.role);
        setCompanyId(found.maintenanceCompanyId ?? '');
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

  useEffect(() => {
    let cancelled = false;

    listMaintenanceCompanies()
      .then((result) => {
        if (!cancelled) {
          setCompanies(result);
        }
      })
      .catch(() => {
        // A failed company-list fetch just leaves the selector's options
        // empty; see UserCreatePage.tsx's identical rationale.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isSelf = id !== undefined && id === currentUser?.id;

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
    setError(null);

    const result = updateUserSchema.safeParse({
      email,
      role,
      maintenanceCompanyId: showCompanySelector ? companyId : undefined,
    });
    if (!result.success) {
      setError(t('users.edit.validationError'));
      return;
    }

    if (!id) {
      return;
    }

    setSubmitting(true);
    try {
      await updateUser(id, result.data);
      navigate('/users');
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
        <h1>{t('users.edit.title')}</h1>
        <p data-testid="user-edit-loading">{t('users.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('users.edit.title')}</h1>
        <p data-testid="user-edit-not-found">{t('users.edit.notFound')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('users.edit.title')}</h1>
        <p data-testid="user-edit-error-state">{t('common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('users.edit.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="user-edit-email-input">{t('users.edit.emailLabel')}</label>
        <input
          id="user-edit-email-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="user-edit-email"
        />
        <label htmlFor="user-edit-role-input">{t('users.edit.roleLabel')}</label>
        <select
          id="user-edit-role-input"
          value={role}
          onChange={handleRoleChange}
          disabled={isSelf}
          data-testid="user-edit-role"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapRoleToLabelKey(option))}
            </option>
          ))}
        </select>
        {showCompanySelector && (
          <>
            <label htmlFor="user-edit-company-input">{t('users.edit.companyLabel')}</label>
            <select
              id="user-edit-company-input"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              required
              data-testid="user-edit-company"
            >
              <option value="" disabled>
                {t('users.edit.companyPlaceholder')}
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </>
        )}
        {error && <p data-testid="user-edit-error">{error}</p>}
        <button type="submit" data-testid="user-edit-submit" disabled={submitting}>
          {t('users.edit.submitLabel')}
        </button>
      </form>
    </main>
  );
}
