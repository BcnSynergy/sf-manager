import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import {
  listMaintenanceCompanies,
  type MaintenanceCompany,
} from '../api/maintenance-company';
import { mapApiErrorToMessageKey } from '../maintenance-company/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// spec.md "List Active Maintenance Companies": distinct loading, empty, and
// error states (never a blank screen); the list request already excludes
// soft-deleted companies (mirrors CommunitiesListPage.tsx's precedent), so
// this page performs no client-side filtering of its own. Delete is out of
// scope for THIS page (tasks.md Phase 10, 10.1: the confirmed soft-delete —
// and its ConfirmDialog — lives on MaintenanceCompanyEditPage.tsx, unlike
// CommunitiesListPage.tsx which owns delete itself). The per-row "Edit" link
// below is Phase 10's only addition to this page: without it the edit page
// would be unreachable from the UI (flagged in Phase 9's apply-progress as
// an open question, resolved here — not listed as a separate tasks.md
// bullet because it is the minimal glue tasks 10.1/10.2 require, not new
// scope). Error messages come exclusively from mapApiErrorToMessageKey
// (spec "No Server-Message String Coupling") — this page never reads
// `ApiError.message`.
export function MaintenanceCompaniesListPage() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<MaintenanceCompany[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  // Mirrors CommunitiesListPage.tsx's mount-effect pattern: a .then/.catch
  // chain (not async/await) so every setState call lives inside a promise
  // continuation, satisfying the react-hooks "no setState directly in an
  // effect" rule.
  const loadCompanies = useCallback(() => {
    return listMaintenanceCompanies()
      .then((result) => {
        setCompanies(result);
        setLoadState('loaded');
        setLoadErrorKey(null);
      })
      .catch((error: unknown) => {
        setLoadErrorKey(
          mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)),
        );
        setLoadState('error');
      });
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('maintenanceCompany.list.title')}</h1>
        <p data-testid="maintenance-companies-list-loading">
          {t('maintenanceCompany.list.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('maintenanceCompany.list.title')}</h1>
        <p data-testid="maintenance-companies-list-error">
          {t(loadErrorKey ?? 'common.error.network')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('maintenanceCompany.list.title')}</h1>
      <Link to="/maintenance-companies/new" data-testid="maintenance-companies-list-create-link">
        {t('maintenanceCompany.list.createLink')}
      </Link>
      {companies.length === 0 ? (
        <p data-testid="maintenance-companies-list-empty">{t('maintenanceCompany.list.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('maintenanceCompany.list.columnName')}</th>
              <th>{t('maintenanceCompany.list.columnTaxId')}</th>
              <th>{t('maintenanceCompany.list.columnContactInfo')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((row) => (
              <tr key={row.id} data-testid={`maintenance-companies-list-row-${row.id}`}>
                <td>{row.name}</td>
                <td>{row.taxId}</td>
                <td>{row.contactInfo}</td>
                <td>
                  <Link
                    to={`/maintenance-companies/${row.id}/edit`}
                    data-testid={`maintenance-companies-list-edit-${row.id}`}
                  >
                    {t('maintenanceCompany.list.editLink')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
