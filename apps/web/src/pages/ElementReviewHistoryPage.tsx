import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  readElementReviewHistory,
  type ElementReviewHistory,
} from '../api/review-history';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../inspectable-element/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// review-history-per-element/design.md Decision 7: a sibling of the shipped
// depth-5 `/edit` and `/label` routes, but a DELIBERATELY anomalous route
// gate (five roles, not SYSTEM_ADMIN-only — see App.tsx's route comment).
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
        <h1>{t('reviewHistory.elementHistory.title')}</h1>
        <p data-testid="element-review-history-loading">
          {t('reviewHistory.elementHistory.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error' || history === null) {
    return (
      <main>
        <h1>{t('reviewHistory.elementHistory.title')}</h1>
        <p data-testid="element-review-history-error">{t(errorMessageKey)}</p>
      </main>
    );
  }

  const { element, entries } = history;
  const decommissioned = element.deactivatedAt !== null;

  return (
    <main>
      <h1>{t('reviewHistory.elementHistory.title')}</h1>

      <section data-testid="element-review-history-header">
        <p>{t('reviewHistory.elementHistory.codeLabel', { code: element.code })}</p>
        <p>{element.name}</p>
        <p>
          {t('reviewHistory.elementHistory.typeLabel', {
            type: t(mapElementTypeToLabelKey(element.elementType)),
          })}
        </p>
        <p>
          {t('reviewHistory.elementHistory.locationLabel', { location: element.location })}
        </p>
        <p>
          {t('reviewHistory.elementHistory.communityLabel', {
            community:
              element.communityName || t('reviewHistory.elementHistory.communityUnknown'),
          })}
        </p>
        {/* inspectable-element-admin-ui spec.md "Element State Shown in the
            List" precedent, mirrored here: rendered through a localized
            label, never a raw boolean/timestamp; `data-element-state`
            distinguishes the two states visually beyond the label's text. */}
        <span
          data-testid="element-review-history-state"
          data-element-state={decommissioned ? 'decommissioned' : 'active'}
        >
          {t(
            decommissioned
              ? 'inspectableElement.list.stateDecommissioned'
              : 'inspectableElement.list.stateActive',
          )}
        </span>
      </section>

      <section data-testid="element-review-history-entries">
        <h2>{t('reviewHistory.elementHistory.entriesTitle')}</h2>
        {entries.length === 0 ? (
          <p data-testid="element-review-history-empty">
            {t('reviewHistory.elementHistory.entriesEmpty')}
          </p>
        ) : (
          <ul>
            {entries.map((entry) => (
              <li
                key={entry.reviewSessionId}
                data-testid={`element-review-history-entry-${entry.reviewSessionId}`}
              >
                <span>{entry.recordedAt}</span>
                <span>
                  {entry.performedByEmail || t('reviewHistory.elementHistory.performerUnknown')}
                </span>
                {entry.reviewed ? (
                  <span>{t('reviewHistory.elementHistory.reviewedLabel')}</span>
                ) : (
                  <span>
                    {t('reviewHistory.elementHistory.unreviewedLabel')} {entry.observations ?? ''}
                  </span>
                )}
                <Link
                  to={`/review-history/${entry.reviewSessionId}`}
                  data-testid={`element-review-history-open-${entry.reviewSessionId}`}
                >
                  {t('reviewHistory.elementHistory.openLink')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
