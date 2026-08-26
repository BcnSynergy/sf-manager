import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { listCommunities, softDeleteCommunity, type Community } from '../api/community';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
        setLoadErrorKey(mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)));
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
      setActionErrorKey(mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)));
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('community.list.title')}</h1>
        <p data-testid="communities-list-loading">{t('community.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('community.list.title')}</h1>
        <p data-testid="communities-list-error">{t(loadErrorKey ?? 'common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('community.list.title')}</h1>
      <Link to="/communities/new" data-testid="communities-list-create-link">
        {t('community.list.createLink')}
      </Link>
      {actionErrorKey && (
        <p data-testid="communities-list-action-error">{t(actionErrorKey)}</p>
      )}
      {communities.length === 0 ? (
        <p data-testid="communities-list-empty">{t('community.list.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('community.list.columnName')}</th>
              <th>{t('community.list.columnAddress')}</th>
              <th>{t('community.list.columnLocale')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {communities.map((row) => (
              <tr key={row.id} data-testid={`communities-list-row-${row.id}`}>
                <td>{row.name}</td>
                <td>{row.address}</td>
                <td>{t(mapLocaleToLabelKey(row.locale))}</td>
                <td>
                  <button
                    type="button"
                    data-testid={`communities-list-delete-${row.id}`}
                    onClick={() => requestDelete(row.id)}
                  >
                    {t('community.list.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('community.list.deleteConfirmTitle')}
        message={t('community.list.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </main>
  );
}
