import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { readElementReviewHistory, type ElementReviewHistory } from '../api/review-history';
import { PageHeader } from '../components/PageHeader';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../inspectable-element/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// review-history-per-element/design.md Decision 7: a sibling of the shipped
// depth-5 `/edit` and `/label` routes, but a DELIBERATELY anomalous route
// gate (five roles, not SYSTEM_ADMIN-only — see authenticated-routes.tsx's
// route comment).
// Element header (code, name, type — through mapElementTypeToLabelKey,
// NEVER the raw enum — location, decommissioned state, community name) +
// the chronological record. Distinct loading / empty / error states, every
// row linking to /review-history/:sessionId. No control of any kind beyond
// those links — this is a read-only view, like ReviewHistoryDetailPage.tsx.
//
// design.md Decision 4/5: "unreachable" (404 INSPECTABLE_ELEMENT_NOT_FOUND)
// and "reachable, never reviewed" (200 + empty entries) are DIFFERENT
// server responses — this page renders them as DIFFERENT states (error vs.
// empty), never conflating the two the way a `[] on any failure` shape
// would. inspectable-element/error-messages.ts's mapApiErrorToMessageKey is
// reused as-is (it already maps INSPECTABLE_ELEMENT_NOT_FOUND to a generic
// not-found key) rather than duplicating a second mapper for the same code.
export function ElementReviewHistoryPage() {
  const { t } = useTranslation();
  const { communityId, elementId } = useParams<{ communityId: string; elementId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [history, setHistory] = useState<ElementReviewHistory | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<string>('common.error.network');

  const loadHistory = useCallback(() => {
    if (communityId === undefined || elementId === undefined) {
      // Every setState call must live inside a promise continuation (mirrors
      // ReviewHistoryDetailPage.tsx's identical guard), even on this
      // synchronous branch, to satisfy the react-hooks
      // no-setState-in-effect rule.
      return Promise.resolve().then(() => {
        setErrorMessageKey('common.error.network');
        setLoadState('error');
      });
    }

    return readElementReviewHistory(communityId, elementId)
      .then((loaded) => {
        setHistory(loaded);
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError(0);
        setErrorMessageKey(mapApiErrorToMessageKey(apiError));
        setLoadState('error');
      });
  }, [communityId, elementId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('reviewHistory.elementHistory.title')} />
        <p className="sf-empty" data-testid="element-review-history-loading">
          {t('reviewHistory.elementHistory.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error' || history === null) {
    return (
      <main>
        <PageHeader title={t('reviewHistory.elementHistory.title')} />
        <p className="sf-empty" data-testid="element-review-history-error">
          {t(errorMessageKey)}
        </p>
      </main>
    );
  }

  const { element, entries } = history;
  const decommissioned = element.deactivatedAt !== null;

  return (
    <main>
      <PageHeader title={t('reviewHistory.elementHistory.title')} />

      <section className="sf-panel" data-testid="element-review-history-header">
        <h2 className="sf-section-title">{element.name}</h2>
        <dl>
          <dt>{t('reviewHistory.elementHistory.fieldCode')}</dt>
          <dd className="sf-data">{element.code}</dd>
          <dt>{t('reviewHistory.elementHistory.fieldType')}</dt>
          <dd>{t(mapElementTypeToLabelKey(element.elementType))}</dd>
          <dt>{t('reviewHistory.elementHistory.fieldLocation')}</dt>
          <dd>{element.location}</dd>
          <dt>{t('reviewHistory.elementHistory.fieldCommunity')}</dt>
          <dd>{element.communityName || t('reviewHistory.elementHistory.communityUnknown')}</dd>
          <dt>{t('reviewHistory.elementHistory.fieldState')}</dt>
          <dd>
            {/* inspectable-element-admin-ui spec.md "Element State Shown in the
                List" precedent, mirrored here: rendered through a localized
                label, never a raw boolean/timestamp; `data-element-state`
                distinguishes the two states visually beyond the label's text. */}
            <span
              data-testid="element-review-history-state"
              className={decommissioned ? 'sf-badge' : 'sf-badge sf-badge-success'}
              data-element-state={decommissioned ? 'decommissioned' : 'active'}
            >
              {t(
                decommissioned
                  ? 'inspectableElement.list.stateDecommissioned'
                  : 'inspectableElement.list.stateActive',
              )}
            </span>
          </dd>
        </dl>
      </section>

      <section className="sf-section" data-testid="element-review-history-entries">
        <h2>{t('reviewHistory.elementHistory.entriesTitle')}</h2>
        {entries.length === 0 ? (
          <p className="sf-empty" data-testid="element-review-history-empty">
            {t('reviewHistory.elementHistory.entriesEmpty')}
          </p>
        ) : (
          <div className="sf-table-wrap">
            <table>
              <caption className="visually-hidden">
                {t('reviewHistory.elementHistory.entriesTitle')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('reviewHistory.elementHistory.columnRecordedAt')}</th>
                  <th scope="col">{t('reviewHistory.elementHistory.columnPerformer')}</th>
                  <th scope="col">{t('reviewHistory.elementHistory.columnResult')}</th>
                  <th scope="col">{t('reviewHistory.elementHistory.columnObservations')}</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.reviewSessionId}
                    data-testid={`element-review-history-entry-${entry.reviewSessionId}`}
                  >
                    <td className="sf-data">{entry.recordedAt}</td>
                    <td>
                      {entry.performedByEmail || t('reviewHistory.elementHistory.performerUnknown')}
                    </td>
                    <td>
                      {entry.reviewed ? (
                        <span className="sf-badge sf-badge-success">
                          {t('reviewHistory.elementHistory.reviewedLabel')}
                        </span>
                      ) : (
                        <span className="sf-badge sf-badge-warning">
                          {t('reviewHistory.elementHistory.unreviewedLabel')}
                        </span>
                      )}
                    </td>
                    <td>{entry.reviewed ? '' : (entry.observations ?? '')}</td>
                    <td>
                      <div className="sf-actions">
                        <Link
                          to={`/review-history/${entry.reviewSessionId}`}
                          className="sf-btn"
                          data-testid={`element-review-history-open-${entry.reviewSessionId}`}
                        >
                          {t('reviewHistory.elementHistory.openLink')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
