import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listReviewSchedule, type ReviewScheduleRow } from '../api/review-schedule';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import {
  NEVER_REVIEWED_LABEL_KEY,
  formatCalendarDate,
  mapReasonToText,
  mapStatusToLabelKey,
} from '../review-schedule/schedule-labels';

type LoadState = 'loading' | 'loaded' | 'error';

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
        <h1>{t('reviewSchedule.title')}</h1>
        <p data-testid="review-schedule-loading">{t('reviewSchedule.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('reviewSchedule.title')}</h1>
        <p data-testid="review-schedule-error">{t('reviewSchedule.error')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('reviewSchedule.title')}</h1>
      {rows.length === 0 ? (
        <p data-testid="review-schedule-empty">{t('reviewSchedule.empty')}</p>
      ) : (
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
                <tr key={rowKey} data-testid={`review-schedule-row-${row.communityId}`}>
                  <td>{row.communityName}</td>
                  <td>{t(mapElementTypeToLabelKey(row.elementType))}</td>
                  <td>{t(mapStatusToLabelKey(row.status))}</td>
                  <td>
                    {reason && (
                      <span data-testid={`review-schedule-reason-${row.communityId}`}>
                        {t(reason.key, reason.params)}
                      </span>
                    )}
                  </td>
                  <td data-testid={`review-schedule-last-review-${row.communityId}`}>
                    {row.lastCoveringSessionDate
                      ? formatCalendarDate(row.lastCoveringSessionDate, i18n.language)
                      : t(NEVER_REVIEWED_LABEL_KEY)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
