import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listReviewSchedule, type ReviewScheduleRow } from '../api/review-schedule';
import { PageHeader } from '../components/PageHeader';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import {
  IN_PROGRESS_LABEL_KEY,
  NEVER_REVIEWED_LABEL_KEY,
  formatCalendarDate,
  mapReasonToText,
  mapStatusToBadgeTone,
  mapStatusToLabelKey,
} from '../review-schedule/schedule-labels';

type LoadState = 'loading' | 'loaded' | 'error';

function badgeClassName(status: ReviewScheduleRow['status']): string {
  const tone = mapStatusToBadgeTone(status);
  return tone ? `sf-badge sf-badge-${tone}` : 'sf-badge';
}

// review-schedule-ui spec: a read-only view of the server's schedule. Scope,
// status, reason and order are all decided server-side, so this page applies
// no client-side filtering, sorting or recomputation, and offers no control.
// Like ReviewHistoryPage, one uniform error message covers every failure:
// the text is a translation key, never server-supplied.
export function ReviewSchedulePage() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ReviewScheduleRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  useEffect(() => {
    listReviewSchedule()
      .then((result) => {
        setRows(result);
        setLoadState('loaded');
      })
      .catch(() => {
        setLoadState('error');
      });
  }, []);

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('reviewSchedule.title')} />
        <p className="sf-empty" data-testid="review-schedule-loading">
          {t('reviewSchedule.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <PageHeader title={t('reviewSchedule.title')} />
        <p className="sf-empty" data-testid="review-schedule-error">
          {t('reviewSchedule.error')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('reviewSchedule.title')} />
      {rows.length === 0 ? (
        <p className="sf-empty" data-testid="review-schedule-empty">
          {t('reviewSchedule.empty')}
        </p>
      ) : (
        <div className="sf-table-wrap">
          <table>
            <caption className="visually-hidden">{t('reviewSchedule.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('reviewSchedule.columnCommunity')}</th>
                <th scope="col">{t('reviewSchedule.columnElementType')}</th>
                <th scope="col">{t('reviewSchedule.columnStatus')}</th>
                <th scope="col">{t('reviewSchedule.columnReason')}</th>
                <th scope="col">{t('reviewSchedule.columnLastReview')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = `${row.communityId}-${row.elementType}`;
                const reason = mapReasonToText(row, i18n.language);
                return (
                  <tr key={rowKey} data-testid={`review-schedule-row-${rowKey}`}>
                    <td>{row.communityName}</td>
                    <td>{t(mapElementTypeToLabelKey(row.elementType))}</td>
                    <td>
                      {/* ui-redesign-foundation design Decision 10: the status
                        as a design-system badge, and the in-progress marker
                        as an outlined badge right after it (text, no
                        control). */}
                      <span
                        className={badgeClassName(row.status)}
                        data-testid={`review-schedule-status-${rowKey}`}
                      >
                        {t(mapStatusToLabelKey(row.status))}
                      </span>
                      {row.inProgress && (
                        <>
                          {/* Read as a separate phrase: "Upcoming, In
                              progress" (fresh review of PR 3). */}
                          <span className="visually-hidden">,</span>{' '}
                          <span
                            className="sf-badge sf-badge-draft"
                            data-testid={`review-schedule-in-progress-${rowKey}`}
                          >
                            {t(IN_PROGRESS_LABEL_KEY)}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {reason && (
                        <span data-testid={`review-schedule-reason-${rowKey}`}>
                          {t(reason.key, reason.params)}
                        </span>
                      )}
                    </td>
                    <td data-testid={`review-schedule-last-review-${rowKey}`}>
                      {row.lastCoveringSessionDate
                        ? formatCalendarDate(row.lastCoveringSessionDate, i18n.language)
                        : t(NEVER_REVIEWED_LABEL_KEY)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
