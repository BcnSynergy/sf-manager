import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { listReviewHistory, type ReviewHistoryRow } from '../api/review-history';

type LoadState = 'loading' | 'loaded' | 'error';

// tasks.md 5.2 / design.md Decision 1 (list scope already computed
// server-side by ReviewHistoryAccessService.listForActor): this page
// performs zero client-side filtering, mirroring ReviewSessionsPage.tsx's
// precedent of trusting an already-scoped list endpoint. GET
// /review-history never rejects with a coded error for any role (it can
// only ever return an empty array or throw a network/unexpected failure),
// so this page does not need review-session/error-messages.ts's per-code
// mapping — a single generic error message covers every failure here.
//
// review-history-company-scope spec "A manager's company-wide list is
// rendered unfiltered": a MAINTENANCE_COMPANY_MANAGER's result may span
// several technicians and communities — this page has no role branch and
// applies no client-side narrowing by community, performer or date for
// that case either, same as every other role. The Performer column
// (design.md Decision 8) renders for every role unconditionally.
export function ReviewHistoryPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ReviewHistoryRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const loadHistory = useCallback(() => {
    return listReviewHistory()
      .then((result) => {
        setRows(result);
        setLoadState('loaded');
      })
      .catch(() => {
        setLoadState('error');
      });
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewHistory.list.title')}</h1>
        <p data-testid="review-history-loading">{t('reviewHistory.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('reviewHistory.list.title')}</h1>
        <p data-testid="review-history-error">{t('reviewHistory.list.error')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('reviewHistory.list.title')}</h1>
      {rows.length === 0 ? (
        <p data-testid="review-history-empty">{t('reviewHistory.list.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('reviewHistory.list.columnCommunity')}</th>
              <th>{t('reviewHistory.list.columnPerformer')}</th>
              <th>{t('reviewHistory.list.columnCompletedAt')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`review-history-row-${row.id}`}>
                <td data-testid={`review-history-community-${row.id}`}>
                  {row.communityName || t('reviewHistory.list.communityUnknown')}
                </td>
                <td data-testid={`review-history-performer-${row.id}`}>
                  {row.performedByEmail || t('reviewHistory.list.performerUnknown')}
                </td>
                <td>{row.completedAt}</td>
                <td>
                  <Link
                    to={`/review-history/${row.id}`}
                    data-testid={`review-history-open-${row.id}`}
                  >
                    {t('reviewHistory.list.openLink')}
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
