import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError } from '../api/client';
import { readReviewHistory, type ReviewHistoryDetail } from '../api/review-history';
import { mapAnswerValueToLabelKey } from '../review-session/answer-value-labels';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// design.md Decision 7: a FORK, not a reuse, of ReviewSessionDetailPage.tsx.
// This is a read-only record of a COMPLETED session — there is no draft
// state here, so every mutation affordance on the source page (code-entry
// form, complete/discard buttons, ConfirmDialog pair, and their handlers)
// is deliberately absent, not merely hidden behind a status check. A test
// asserts no button/input/form renders at all.
//
// design.md Decision 6: entries are paired with the FROZEN question wording
// (`questions`, via findFrozenWithSnapshot) rather than the live template —
// answering the spec's "read back paired with the template snapshot's
// wording" requirement. `elementCode` is resolved LIVE and nullable
// (Decision 6/Open Question 3); a decommissioned/soft-deleted element
// renders a neutral localized label instead of a blank cell.
//
// api/review-history.ts's module comment: every rejection cause for
// GET /review-history/:sessionId collapses server-side to a single
// REVIEW_SESSION_NOT_FOUND code (indistinguishable 404), so this page needs
// no not-found/error split — one generic LoadState covers the ApiError,
// with the message key resolved via the shared error-messages mapper
// (never branching on the source page's `isDraft`/notFound distinction,
// which does not apply to a completed-only record).
export function ReviewHistoryDetailPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [detail, setDetail] = useState<ReviewHistoryDetail | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<string>('common.error.network');

  const loadDetail = useCallback(() => {
    if (sessionId === undefined) {
      // Mirrors ReviewSessionDetailPage.tsx's identical guard: every
      // setState call must live inside a promise continuation, even on
      // this synchronous branch, to satisfy the react-hooks
      // no-setState-in-effect rule.
      return Promise.resolve().then(() => {
        setErrorMessageKey('common.error.network');
        setLoadState('error');
      });
    }

    return readReviewHistory(sessionId)
      .then((loaded) => {
        setDetail(loaded);
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError(0);
        setErrorMessageKey(mapApiErrorToMessageKey(apiError));
        setLoadState('error');
      });
  }, [sessionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewHistory.detail.title')}</h1>
        <p data-testid="review-history-detail-loading">{t('reviewHistory.detail.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error' || detail === null) {
    return (
      <main>
        <h1>{t('reviewHistory.detail.title')}</h1>
        <p data-testid="review-history-detail-error">{t(errorMessageKey)}</p>
      </main>
    );
  }

  const questionTextById = new Map(detail.questions.map((question) => [question.questionId, question.text]));

  return (
    <main>
      <h1>{t('reviewHistory.detail.title')}</h1>
      <p data-testid="review-history-detail-completed-at">
        {t('reviewHistory.detail.completedAtLabel', { completedAt: detail.completedAt })}
      </p>
      <p data-testid="review-history-detail-coverage">
        {t('reviewHistory.detail.coverageLabel', {
          reviewed: detail.coverage.reviewed,
          unreviewed: detail.coverage.unreviewed,
        })}
      </p>

      <section data-testid="review-history-detail-entries">
        <h2>{t('reviewHistory.detail.entriesTitle')}</h2>
        {detail.entries.length === 0 ? (
          <p data-testid="review-history-detail-entries-empty">
            {t('reviewHistory.detail.entriesEmpty')}
          </p>
        ) : (
          <ul>
            {detail.entries.map((entry) => (
              <li
                key={entry.inspectableElementId}
                data-testid={`review-history-detail-entry-${entry.inspectableElementId}`}
              >
                <p data-testid={`review-history-detail-entry-code-${entry.inspectableElementId}`}>
                  {entry.elementCode ?? t('reviewHistory.detail.elementCodeUnknown')}
                </p>
                {entry.reviewed ? (
                  <ul>
                    {entry.answers.map((answer) => (
                      <li key={answer.questionId}>
                        {questionTextById.get(answer.questionId) ?? answer.questionId}:{' '}
                        {t(mapAnswerValueToLabelKey(answer.answer))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {t('reviewHistory.detail.entryUnreviewedLabel')}{' '}
                    <span
                      data-testid={`review-history-detail-observations-${entry.inspectableElementId}`}
                    >
                      {entry.observations ?? ''}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
