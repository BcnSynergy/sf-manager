import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isMaintenanceRole } from '@sf-manager/validation';
import { listMaintenanceCompanies } from '../api/maintenance-company';
import { ApiError } from '../api/client';
import { deactivateUser, listUsers, type User } from '../api/users';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapApiErrorToMessageKey } from '../users/error-messages';
import { mapRoleToLabelKey } from '../users/role-labels';

type LoadState = 'loading' | 'loaded' | 'error';

// spec.md "List Active Users" / "Deactivate User": distinct loading, empty,
// and error states (never a blank screen); deactivate only after explicit
// confirmation (design.md Decision 4's ConfirmDialog), unavailable on the
// admin's own row (design.md "Data Flow — deactivate"). Error messages come
// exclusively from mapApiErrorToMessageKey (spec "No Server-Message String
// Coupling") — this page never reads `ApiError.message`.
//
// maintenance-company design.md Decision 7: the company NAME is resolved
// client-side from an id->name map built from GET /maintenance-companies,
// fetched ONCE on mount, in parallel with (never sequential to) the users
// list — this page never renders the raw maintenanceCompanyId UUID
// (user-admin-ui spec "Maintenance Company Rendered By Name"). An id that
// doesn't resolve in the map (soft-deleted company, design.md Decision 6's
// accepted anomaly) or a maintenance-role user without a company at all
// (grandfathered pre-migration row) both render the localized
// `maintenanceCompany.unknown` label instead of a blank cell or a crash.
export function UsersListPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [pendingDeactivateId, setPendingDeactivateId] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
  const [companyNamesById, setCompanyNamesById] = useState<Record<string, string>>({});

  // Deliberately does not set loadState back to 'loading' here: this runs
  // from the mount effect (initial loadState is already 'loading' via
  // useState) and from the post-deactivate refetch (where flashing back to
  // a full-page loading state would be worse UX than updating the rendered
  // rows once the refetch resolves). Uses a .then/.catch chain rather than
  // async/await, matching AuthProvider.tsx's mount-effect pattern — the
  // react-hooks "no setState directly in an effect" lint rule requires
  // setState calls to live inside a promise-continuation callback, not the
  // synchronous prefix of an async function invoked from the effect body.
  const loadUsers = useCallback(() => {
    return listUsers()
      .then((result) => {
        setUsers(result);
        setLoadState('loaded');
        setLoadErrorKey(null);
      })
      .catch((error: unknown) => {
        setLoadErrorKey(mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)));
        setLoadState('error');
      });
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Runs once on mount, in parallel with loadUsers() above (neither awaits
  // the other) — design.md Decision 7's "never sequentially" call. A failed
  // fetch here just leaves the map empty, so every maintenance-role row
  // falls back to `maintenanceCompany.unknown` rather than the page failing
  // to render the users list it already has.
  useEffect(() => {
    let cancelled = false;

    listMaintenanceCompanies()
      .then((companies) => {
        if (cancelled) {
          return;
        }
        setCompanyNamesById(Object.fromEntries(companies.map((company) => [company.id, company.name])));
      })
      .catch(() => {
        // Intentionally swallowed — see comment above.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function resolveCompanyName(row: User): string {
    if (!isMaintenanceRole(row.role)) {
      return '';
    }
    if (row.maintenanceCompanyId === null) {
      return t('maintenanceCompany.unknown');
    }
    return companyNamesById[row.maintenanceCompanyId] ?? t('maintenanceCompany.unknown');
  }

  function requestDeactivate(id: string) {
    setActionErrorKey(null);
    setPendingDeactivateId(id);
  }

  async function confirmDeactivate() {
    const id = pendingDeactivateId;
    setPendingDeactivateId(null);
    if (!id) {
      return;
    }

    try {
      await deactivateUser(id);
      await loadUsers();
    } catch (error) {
      setActionErrorKey(mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)));
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('users.list.title')}</h1>
        <p data-testid="users-list-loading">{t('users.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('users.list.title')}</h1>
        <p data-testid="users-list-error">{t(loadErrorKey ?? 'common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('users.list.title')}</h1>
      <Link to="/users/new" data-testid="users-list-create-link">
        {t('users.list.createLink')}
      </Link>
      {actionErrorKey && (
        <p data-testid="users-list-action-error">{t(actionErrorKey)}</p>
      )}
      {users.length === 0 ? (
        <p data-testid="users-list-empty">{t('users.list.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('users.list.columnId')}</th>
              <th>{t('users.list.columnEmail')}</th>
              <th>{t('users.list.columnRole')}</th>
              <th>{t('users.list.columnCompany')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} data-testid={`users-list-row-${row.id}`}>
                <td>{row.id}</td>
                <td>{row.email}</td>
                <td>{t(mapRoleToLabelKey(row.role))}</td>
                <td>{resolveCompanyName(row)}</td>
                <td>
                  <Link to={`/users/${row.id}/edit`} data-testid={`users-list-edit-${row.id}`}>
                    {t('users.list.editLink')}
                  </Link>
                  {row.id !== currentUser?.id && (
                    <button
                      type="button"
                      data-testid={`users-list-deactivate-${row.id}`}
                      onClick={() => requestDeactivate(row.id)}
                    >
                      {t('users.list.deactivate')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog
        open={pendingDeactivateId !== null}
        title={t('users.list.deactivateConfirmTitle')}
        message={t('users.list.deactivateConfirmMessage')}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setPendingDeactivateId(null)}
      />
    </main>
  );
}
