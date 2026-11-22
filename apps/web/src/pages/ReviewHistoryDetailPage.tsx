import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  listReviewHistoryPhotos,
  readReviewHistory,
  reviewHistoryPhotoUrl,
  type ReviewHistoryDetail,
  type ReviewHistoryPhoto,
} from '../api/review-history';
import { PageHeader } from '../components/PageHeader';
import { mapAnswerValueToLabelKey } from '../review-session/answer-value-labels';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';
// The photos of one session, tagged with that session's id so a result is
// only ever shown next to the detail it belongs to.
type PhotosResult =
  | { sessionId: string; state: 'loaded'; photos: ReviewHistoryPhoto[] }
  | { sessionId: string; state: 'error' };

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
//
// review-history-company-scope design.md Decision 8: `performedByEmail` is
// rendered for every role, no manager-specific variant — same placeholder
// treatment as an unresolvable community name elsewhere in this surface.
export function ReviewHistoryDetailPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [detail, setDetail] = useState<ReviewHistoryDetail | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<string>('common.error.network');
  const [photosResult, setPhotosResult] = useState<PhotosResult | null>(null);

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

  // EN-164 S5 (T3): the photos load once the review itself has loaded (a
  // review the caller cannot open needs no photo request), and on their own:
  // a failure here never hides the review, it shows one note instead.
  const loadedSessionId = detail?.id;
  useEffect(() => {
    if (loadedSessionId === undefined) {
      return;
    }
    let active = true;
    listReviewHistoryPhotos(loadedSessionId)
      .then((listed) => {
        if (active) {
          setPhotosResult({ sessionId: loadedSessionId, state: 'loaded', photos: listed });
        }
      })
      .catch(() => {
        if (active) {
          setPhotosResult({ sessionId: loadedSessionId, state: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [loadedSessionId]);

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('reviewHistory.detail.title')} />
        <p className="sf-empty" data-testid="review-history-detail-loading">
          {t('reviewHistory.detail.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error' || detail === null) {
    return (
      <main>
        <PageHeader title={t('reviewHistory.detail.title')} />
        <p className="sf-empty" data-testid="review-history-detail-error">
          {t(errorMessageKey)}
        </p>
      </main>
    );
  }

  const questionTextById = new Map(
    detail.questions.map((question) => [question.questionId, question.text]),
  );
  // A result of another session (the route changed) is never shown.
  const currentPhotos = photosResult?.sessionId === detail.id ? photosResult : null;
  const photos = currentPhotos?.state === 'loaded' ? currentPhotos.photos : [];
  // Oldest first within each element, as the server lists them.
  const photosByElementId = new Map<string, ReviewHistoryPhoto[]>();
  for (const photo of photos) {
    const forElement = photosByElementId.get(photo.inspectableElementId) ?? [];
    forElement.push(photo);
    photosByElementId.set(photo.inspectableElementId, forElement);
  }

  return (
    <main>
      <PageHeader title={t('reviewHistory.detail.title')}>
        {/* review-document-ui spec "Exactly One Entry Link Reaches the
            Document Page", review-history-ui spec "Read-Only Historical
            Session View": the single, non-mutating View document link, for
            every one of the five history roles this page already serves —
            this view's read is scoped by history, not by performer, so no
            role branching is needed here (decided 2026-09-23, supersedes
            proposal question 3). */}
        <Link
          to={`/review-history/${sessionId}/document`}
          className="sf-btn sf-btn-primary"
          data-testid="review-history-detail-document-link"
        >
          {t('reviewHistory.detail.documentLink')}
        </Link>
      </PageHeader>

      <div className="sf-panel">
        <dl>
          <dt>{t('reviewHistory.detail.fieldCompletedAt')}</dt>
          <dd className="sf-data" data-testid="review-history-detail-completed-at">
            {detail.completedAt}
          </dd>
          <dt>{t('reviewHistory.detail.fieldPerformer')}</dt>
          <dd data-testid="review-history-detail-performer">
            {detail.performedByEmail || t('reviewHistory.detail.performerUnknown')}
          </dd>
          <dt>{t('reviewHistory.detail.fieldCoverage')}</dt>
          <dd data-testid="review-history-detail-coverage">
            {t('reviewHistory.detail.coverageLabel', {
              reviewed: detail.coverage.reviewed,
              unreviewed: detail.coverage.unreviewed,
            })}
          </dd>
        </dl>
      </div>

      <section className="sf-section" data-testid="review-history-detail-entries">
        <h2>{t('reviewHistory.detail.entriesTitle')}</h2>
        {currentPhotos?.state === 'error' && (
          <p className="sf-empty" data-testid="review-history-detail-photos-error">
            {t('reviewHistory.detail.photosLoadError')}
          </p>
        )}
        {detail.entries.length === 0 ? (
          <p className="sf-empty" data-testid="review-history-detail-entries-empty">
            {t('reviewHistory.detail.entriesEmpty')}
          </p>
        ) : (
          <ul className="sf-stack">
            {detail.entries.map((entry) => (
              <li
                key={entry.inspectableElementId}
                className="sf-panel"
                data-testid={`review-history-detail-entry-${entry.inspectableElementId}`}
              >
                <div className="sf-panel-header">
                  <h3 className="sf-section-title">
                    <span
                      className={entry.elementCode === null ? undefined : 'sf-data'}
                      data-testid={`review-history-detail-entry-code-${entry.inspectableElementId}`}
                    >
                      {entry.elementCode ?? t('reviewHistory.detail.elementCodeUnknown')}
                    </span>
                  </h3>
                  {/* review-history-per-element/design.md Decision 7: the
                      other of the two entry links into
                      ElementReviewHistoryPage (the sibling lives on
                      CommunityElementsListPage). This is what makes the four
                      non-admin scopes reachable in a browser at all.
                      review-history-per-element/spec.md "Two Entry Links Reach
                      the Element History Page": an entry whose element no
                      longer resolves (elementCode === null, e.g.
                      soft-deleted) MUST NOT offer the link at all, rather than
                      a link leading to a rejection. */}
                  {entry.elementCode !== null && (
                    <Link
                      to={`/communities/${detail.communityId}/inspectable-elements/${entry.inspectableElementId}/history`}
                      className="sf-btn"
                      data-testid={`review-history-detail-entry-history-${entry.inspectableElementId}`}
                    >
                      {t('reviewHistory.detail.elementHistoryLink')}
                    </Link>
                  )}
                </div>
                {entry.reviewed ? (
                  <dl>
                    {entry.answers.map((answer) => (
                      <Fragment key={answer.questionId}>
                        <dt>
                          {questionTextById.get(answer.questionId) ??
                            t('reviewHistory.detail.questionTextUnknown')}
                        </dt>
                        <dd>{t(mapAnswerValueToLabelKey(answer.answer))}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : (
                  <p>
                    <span className="sf-badge sf-badge-warning">
                      {t('reviewHistory.detail.entryUnreviewedLabel')}
                    </span>{' '}
                    <span
                      data-testid={`review-history-detail-observations-${entry.inspectableElementId}`}
                    >
                      {entry.observations ?? ''}
                    </span>
                  </p>
                )}
                {(photosByElementId.get(entry.inspectableElementId) ?? []).length > 0 && (
                  <ul
                    className="sf-photo-list"
                    aria-label={t('reviewHistory.detail.photosLabel')}
                    data-testid={`review-history-detail-photos-${entry.inspectableElementId}`}
                  >
                    {(photosByElementId.get(entry.inspectableElementId) ?? []).map(
                      (photo, index) => (
                        <li key={photo.id} className="sf-photo-item">
                          <a
                            href={reviewHistoryPhotoUrl(detail.id, photo.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('reviewHistory.detail.photoOpenLabel', {
                              number: index + 1,
                            })}
                          >
                            <img
                              className="sf-photo-thumb"
                              src={reviewHistoryPhotoUrl(detail.id, photo.id)}
                              alt={t('reviewHistory.detail.photoAlt', { number: index + 1 })}
                            />
                          </a>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
