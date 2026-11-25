import type { Role } from '@sf-manager/validation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { listReviewHistory, type ReviewHistoryRow } from '../api/review-history';
import { formatDocumentDate } from '../review-session/format-date';
import { roleOffers } from './role-offers';

const HISTORY_PATH = '/review-history';
const SHOWN = 5;

type LoadState =
  { state: 'loading' } | { state: 'error' } | { state: 'loaded'; rows: ReviewHistoryRow[] };

// Newest first by completion time, then by id, so the five shown never
// depend on the direction the server happens to list them in.
function latest(rows: ReviewHistoryRow[]): ReviewHistoryRow[] {
  return [...rows]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id.localeCompare(a.id))
    .slice(0, SHOWN);
}

// home-page slice 3 (EN-238): the latest completed reviews the user can see,
// from the same scoped GET /review-history as the history page (the server
// decides the scope per role; an ungranted manager gets an empty list).
// It asks the server for the five newest only (`limit`, EN-240) and still
// sorts and cuts them itself, so the five shown never depend on the
// direction the server lists them in. An empty community name or email (a
// soft-deleted community or user) gets the history page's neutral label.
export function HomeRecentActivity({ role }: { role: Role }) {
  const { t, i18n } = useTranslation();
  const shown = roleOffers(role, HISTORY_PATH);
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });

  useEffect(() => {
    if (!shown) return;
    let active = true;
    listReviewHistory({ limit: SHOWN })
      .then((rows) => {
        if (active) setLoad({ state: 'loaded', rows: latest(rows) });
      })
      .catch(() => {
        if (active) setLoad({ state: 'error' });
      });
    return () => {
      active = false;
    };
  }, [shown]);

  if (!shown) return null;

  return (
    <section className="sf-section" aria-labelledby="home-activity-title">
      <h2 className="sf-section-title" id="home-activity-title">
        {t('home.activity.title')}
      </h2>
      {load.state === 'loading' && (
        <p className="sf-empty" data-testid="home-activity-loading">
          {t('home.activity.loading')}
        </p>
      )}
      {load.state === 'error' && (
        <p className="sf-empty" data-testid="home-activity-error">
          {t('home.activity.error')}
        </p>
      )}
      {load.state === 'loaded' && load.rows.length === 0 && (
        <p className="sf-empty" data-testid="home-activity-none">
          {t('home.activity.none')}
        </p>
      )}
      {load.state === 'loaded' && load.rows.length > 0 && (
        <>
          <ul className="sf-home-activity" data-testid="home-activity-list">
            {load.rows.map((row) => (
              <li key={row.id}>
                <Link to={`${HISTORY_PATH}/${row.id}`} aria-describedby={`home-activity-${row.id}`}>
                  {row.communityName || t('reviewHistory.list.communityUnknown')}
                </Link>
                <span className="sf-home-activity-meta" id={`home-activity-${row.id}`}>
                  {t('home.activity.completed', {
                    date: formatDocumentDate(new Date(row.completedAt), i18n.language),
                    email: row.performedByEmail || t('reviewHistory.list.performerUnknown'),
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <Link to={HISTORY_PATH}>{t('home.activity.viewAll')}</Link>
          </p>
        </>
      )}
    </section>
  );
}
