import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { listOwnReviewSessions, type ReviewSession } from '../api/review-session';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// review-session-ui spec "Both Non-Admin Roles Have a Reachable Entry
// Point" + "Pause, Resume and Discard a Draft" ("A resume entry point for a
// session MUST be offered only to the user who opened it"): GET
// /review-sessions is already scoped to the caller's own drafts
// (list-own-review-sessions.use-case.ts, design.md Open Question "drafts
// only"), so this page performs no client-side filtering of its own —
// mirrors CommunityElementsListPage.tsx's precedent of trusting an
// already-scoped list endpoint. Error messages come exclusively from
// mapApiErrorToMessageKey — this page never reads `ApiError.message`.
export function ReviewSessionsPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const loadSessions = useCallback(() => {
    return listOwnReviewSessions()
      .then((result) => {
        setSessions(result);
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
    void loadSessions();
  }, [loadSessions]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewSession.entry.title')}</h1>
        <p data-testid="review-sessions-loading">{t('reviewSession.entry.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('reviewSession.entry.title')}</h1>
        <p data-testid="review-sessions-error">{t(loadErrorKey ?? 'common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('reviewSession.entry.title')}</h1>
      <Link to="/review-sessions/new" data-testid="review-sessions-start-link">
        {t('reviewSession.entry.startLink')}
      </Link>
      {sessions.length === 0 ? (
        <p data-testid="review-sessions-empty">{t('reviewSession.entry.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('reviewSession.entry.columnStarted')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} data-testid={`review-sessions-row-${session.id}`}>
                <td>{session.startedAt}</td>
                <td>
                  <Link
                    to={`/review-sessions/${session.id}`}
                    data-testid={`review-sessions-resume-${session.id}`}
                  >
                    {t('reviewSession.entry.resumeLink')}
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
