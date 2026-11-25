import type { Role } from '@sf-manager/validation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { listReviewSchedule, type ReviewScheduleStatus } from '../api/review-schedule';
import { listOwnReviewSessions } from '../api/review-session';
import { NAV_ITEMS_BY_ROLE } from '../layout/nav-items';
import { mapStatusToBadgeTone } from '../review-schedule/schedule-labels';

const SCHEDULE_PATH = '/review-schedule';
const SESSIONS_PATH = '/review-sessions';

// The schedule statuses that raise an alert, in the order they are shown.
// UP_TO_DATE never does.
const ALERT_STATUSES: readonly { status: ReviewScheduleStatus; labelKey: string }[] = [
  { status: 'OVERDUE', labelKey: 'home.alerts.overdue' },
  { status: 'NEVER_REVIEWED', labelKey: 'home.alerts.neverReviewed' },
  { status: 'UPCOMING', labelKey: 'home.alerts.upcoming' },
];

type Alert = { key: string; labelKey: string; count: number; to: string; badge: string };

type LoadState = { state: 'loading' } | { state: 'error' } | { state: 'loaded'; alerts: Alert[] };

function offers(role: Role, path: string): boolean {
  return (
    Object.hasOwn(NAV_ITEMS_BY_ROLE, role) &&
    NAV_ITEMS_BY_ROLE[role].some((item) => item.to === path)
  );
}

function badgeClassName(status: ReviewScheduleStatus): string {
  const tone = mapStatusToBadgeTone(status);
  return tone ? `sf-badge sf-badge-${tone}` : 'sf-badge';
}

// home-page slice 2 (EN-237): counts of what needs attention, each linking
// to the page that lists it. A role gets the schedule alerts only if its
// navigation offers the Review schedule, and the drafts alert only if it
// offers Review sessions, so an alert never links to a page the role cannot
// open and no request is made that the role would be denied. Statuses and
// counts are the server's (review-schedule-ui): nothing is recomputed here.
export function HomeAlerts({ role }: { role: Role }) {
  const { t } = useTranslation();
  const showSchedule = offers(role, SCHEDULE_PATH);
  const showDrafts = offers(role, SESSIONS_PATH);
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });

  useEffect(() => {
    if (!showSchedule && !showDrafts) return;
    let active = true;
    Promise.all([
      showSchedule ? listReviewSchedule() : Promise.resolve([]),
      showDrafts ? listOwnReviewSessions() : Promise.resolve([]),
    ])
      .then(([rows, ownDrafts]) => {
        if (!active) return;
        const alerts: Alert[] = ALERT_STATUSES.map(({ status, labelKey }) => ({
          key: status,
          labelKey,
          count: rows.filter((row) => row.status === status).length,
          to: SCHEDULE_PATH,
          badge: badgeClassName(status),
        }));
        alerts.push({
          key: 'DRAFTS',
          labelKey: 'home.alerts.drafts',
          count: ownDrafts.length,
          to: SESSIONS_PATH,
          badge: 'sf-badge',
        });
        setLoad({ state: 'loaded', alerts: alerts.filter((alert) => alert.count > 0) });
      })
      .catch(() => {
        if (active) setLoad({ state: 'error' });
      });
    return () => {
      active = false;
    };
  }, [showSchedule, showDrafts]);

  if (!showSchedule && !showDrafts) return null;

  return (
    <section className="sf-section" aria-labelledby="home-alerts-title">
      <h2 className="sf-section-title" id="home-alerts-title">
        {t('home.alerts.title')}
      </h2>
      {load.state === 'loading' && (
        <p className="sf-empty" data-testid="home-alerts-loading">
          {t('home.alerts.loading')}
        </p>
      )}
      {load.state === 'error' && (
        <p className="sf-empty" data-testid="home-alerts-error">
          {t('home.alerts.error')}
        </p>
      )}
      {load.state === 'loaded' && load.alerts.length === 0 && (
        <p className="sf-empty" data-testid="home-alerts-none">
          {t('home.alerts.none')}
        </p>
      )}
      {load.state === 'loaded' && load.alerts.length > 0 && (
        <ul className="sf-home-alerts" data-testid="home-alerts-list">
          {load.alerts.map((alert) => (
            <li key={alert.key}>
              <Link to={alert.to}>
                <span className={alert.badge}>{t(alert.labelKey, { count: alert.count })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
