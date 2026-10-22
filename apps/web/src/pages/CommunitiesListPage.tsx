import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { listCommunities, softDeleteCommunity, type Community } from '../api/community';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { mapApiErrorToMessageKey } from '../community/error-messages';
import { mapLocaleToLabelKey } from '../community/locale-labels';

type LoadState = 'loading' | 'loaded' | 'error';

// spec.md "List Active Communities" / "Soft-Delete Community": distinct
// loading, empty, and error states (never a blank screen); the list request
// already excludes soft-deleted communities (mirrors UsersListPage.tsx's
// precedent — deactivated users are likewise never in listUsers()'s
// result), so this page performs no client-side filtering of its own.
// Delete only happens after explicit confirmation (design.md Decision 4's
// ConfirmDialog) and refetches the list instead of any manual reload. Error
// messages come exclusively from mapApiErrorToMessageKey (spec "No
// Server-Message String Coupling") — this page never reads `ApiError.message`.
export function CommunitiesListPage() {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);

  // Mirrors UsersListPage.tsx's mount-effect / refetch pattern: a
  // .then/.catch chain (not async/await) so every setState call lives
  // inside a promise continuation, satisfying the react-hooks "no setState
  // directly in an effect" rule, and reused unchanged for the post-delete
  // refetch.
  const loadCommunities = useCallback(() => {
    return listCommunities()
      .then((result) => {
        setCommunities(result);
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
    void loadCommunities();
  }, [loadCommunities]);

  function requestDelete(id: string) {
    setActionErrorKey(null);
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) {
      return;
    }

    try {
      await softDeleteCommunity(id);
      await loadCommunities();
    } catch (error) {
      setActionErrorKey(
        mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)),
      );
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('community.list.title')} />
        <p className="sf-empty" data-testid="communities-list-loading">
          {t('community.list.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <PageHeader title={t('community.list.title')} />
        <p className="sf-empty" data-testid="communities-list-error">
          {t(loadErrorKey ?? 'common.error.network')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('community.list.title')}>
        <Link
          to="/communities/new"
          className="sf-btn sf-btn-primary"
          data-testid="communities-list-create-link"
        >
          {t('community.list.createLink')}
        </Link>
      </PageHeader>
      {actionErrorKey && (
        <div
          className="sf-alert sf-alert-danger"
          role="alert"
          data-testid="communities-list-action-error"
        >
          <span className="sf-alert-icon" aria-hidden="true">
            !
          </span>
          <p>{t(actionErrorKey)}</p>
        </div>
      )}
      {communities.length === 0 ? (
        <p className="sf-empty" data-testid="communities-list-empty">
          {t('community.list.empty')}
        </p>
      ) : (
        <div className="sf-table-wrap">
          <table>
            <caption className="visually-hidden">{t('community.list.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('community.list.columnName')}</th>
                <th scope="col">{t('community.list.columnAddress')}</th>
                <th scope="col">{t('community.list.columnLocale')}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {communities.map((row) => (
                <tr key={row.id} data-testid={`communities-list-row-${row.id}`}>
                  <td>{row.name}</td>
                  <td>{row.address}</td>
                  <td>{t(mapLocaleToLabelKey(row.locale))}</td>
                  <td>
                    <div className="sf-actions">
                      <Link
                        to={`/communities/${row.id}`}
                        className="sf-btn"
                        data-testid={`communities-list-view-${row.id}`}
                      >
                        {t('community.list.viewLink')}
                      </Link>
                      <Link
                        to={`/communities/${row.id}/edit`}
                        className="sf-btn"
                        data-testid={`communities-list-edit-${row.id}`}
                      >
                        {t('community.list.editLink')}
                      </Link>
                      <button
                        type="button"
                        className="sf-btn sf-btn-danger"
                        data-testid={`communities-list-delete-${row.id}`}
                        onClick={() => requestDelete(row.id)}
                      >
                        {t('community.list.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        tone="danger"
        open={pendingDeleteId !== null}
        title={t('community.list.deleteConfirmTitle')}
        message={t('community.list.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </main>
  );
}
