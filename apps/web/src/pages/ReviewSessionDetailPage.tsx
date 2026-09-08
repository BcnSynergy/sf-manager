import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  completeReviewSession,
  discardReviewSession,
  readReviewSession,
  type ReviewSessionDetail,
} from '../api/review-session';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// review-session-ui spec "Manual Code Entry Only": a plain text input, no
// camera/scanner control of any kind (deliberately excluded — see the
// module-level comment on ReviewSessionElementPage.tsx). Submitting
// navigates to the code's answer route rather than resolving inline —
// design.md Decision 10's "four distinct, reload-survivable web routes":
// resolution (and the uniform-rejection-message rendering, spec "Rejected
// Codes Get One Uniform Message") happens on that route's own mount, not
// here, so this page's own LoadState stays about the SESSION, not about
// whatever code was last typed. ELEMENT_CODE_ALPHABET
// (packages/validation/src/inspectable-element) is uppercase-only, so
// uppercasing here is the whole of "case-insensitive" acceptance the spec
// asks for; trimming satisfies the same requirement's whitespace clause.
//
// review-session-ui spec "Complete a Session and Explain Its Gaps": the
// completion 409's `elementCodes` (design.md Decision 2) are rendered as
// links straight to each offending element's answer route — the same route
// the code-entry form above targets, `GET .../elements/:code` being scoped
// by (communityId, elementType) already read off this session (design.md
// Decision 6), so a code named back to the user here resolves identically
// through it. This reuses the existing mark-unreviewed-with-reason path
// (ReviewSessionElementPage.tsx) instead of building a second in-page gap
// form, which the design's own text ("the UI can navigate to them")
// anticipates directly.
export function ReviewSessionDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [session, setSession] = useState<ReviewSessionDetail | null>(null);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const [pendingComplete, setPendingComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [unreviewedCodes, setUnreviewedCodes] = useState<string[] | null>(null);

  const [pendingDiscard, setPendingDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const loadSession = useCallback(() => {
    if (sessionId === undefined) {
      // Every setState call must live inside a promise continuation, even
      // on this synchronous guard clause — otherwise the react-hooks "no
      // setState directly in an effect" rule fires (mirrors
      // ReviewTemplateDetailPage.tsx's identical guard).
      return Promise.resolve().then(() => {
        setLoadState('error');
      });
    }

    return readReviewSession(sessionId)
      .then((loaded) => {
        setSession(loaded);
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setLoadState('not-found');
          return;
        }
        setLoadState('error');
      });
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodeError(null);

    const trimmed = code.trim().toUpperCase();
    if (trimmed === '') {
      setCodeError(t('reviewSession.detail.codeValidationError'));
      return;
    }

    navigate(`/review-sessions/${sessionId}/elements/${encodeURIComponent(trimmed)}`);
  }

  function requestComplete() {
    setCompleteError(null);
    setUnreviewedCodes(null);
    setPendingComplete(true);
  }

  async function confirmComplete() {
    setPendingComplete(false);
    if (sessionId === undefined) {
      return;
    }
    setCompleting(true);
    try {
      await completeReviewSession(sessionId);
      await loadSession();
    } catch (caughtError) {
      const apiError = caughtError instanceof ApiError ? caughtError : new ApiError(0);
      if (apiError.code === 'UNREVIEWED_ELEMENTS_WITHOUT_REASON') {
        const codes = apiError.extra?.elementCodes;
        setUnreviewedCodes(Array.isArray(codes) ? (codes as string[]) : []);
      }
      setCompleteError(t(mapApiErrorToMessageKey(apiError)));
    } finally {
      setCompleting(false);
    }
  }

  function requestDiscard() {
    setDiscardError(null);
    setPendingDiscard(true);
  }

  async function confirmDiscard() {
    setPendingDiscard(false);
    if (sessionId === undefined) {
      return;
    }
    setDiscarding(true);
    try {
      await discardReviewSession(sessionId);
      navigate('/review-sessions');
    } catch (caughtError) {
      setDiscardError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setDiscarding(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewSession.detail.title')}</h1>
        <p data-testid="review-session-detail-loading">{t('reviewSession.detail.loading')}</p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('reviewSession.detail.title')}</h1>
        <p data-testid="review-session-detail-not-found">{t('reviewSession.detail.notFound')}</p>
      </main>
    );
  }

  if (loadState === 'error' || session === null) {
    return (
      <main>
        <h1>{t('reviewSession.detail.title')}</h1>
        <p data-testid="review-session-detail-error">{t('reviewSession.detail.error')}</p>
      </main>
    );
  }

  const isDraft = session.status === 'draft';

  return (
    <main>
      <h1>{t('reviewSession.detail.title')}</h1>
      <p data-testid="review-session-detail-status">
        {t('reviewSession.detail.statusLabel')}:{' '}
        {t(isDraft ? 'reviewSession.detail.statusDraft' : 'reviewSession.detail.statusCompleted')}
      </p>
      <p data-testid="review-session-detail-coverage">
        {t('reviewSession.detail.coverageLabel', {
          reviewed: session.coverage.reviewed,
          unreviewed: session.coverage.unreviewed,
        })}
      </p>

      {!isDraft && (
        <p data-testid="review-session-detail-completed-notice">
          {t('reviewSession.detail.completedNotice')}
        </p>
      )}

      <section data-testid="review-session-detail-entries">
        <h2>{t('reviewSession.detail.entriesTitle')}</h2>
        {session.entries.length === 0 ? (
          <p data-testid="review-session-detail-entries-empty">
            {t('reviewSession.detail.entriesEmpty')}
          </p>
        ) : (
          <ul>
            {session.entries.map((entry) => (
              <li
                key={entry.inspectableElementId}
                data-testid={`review-session-detail-entry-${entry.inspectableElementId}`}
              >
                {entry.reviewed
                  ? t('reviewSession.detail.entryReviewed')
                  : t('reviewSession.detail.entryUnreviewed', {
                      reason: entry.observations ?? '',
                    })}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isDraft && (
        <section>
          <form onSubmit={handleCodeSubmit} noValidate>
            <label htmlFor="review-session-detail-code-input">
              {t('reviewSession.detail.codeLabel')}
            </label>
            <input
              id="review-session-detail-code-input"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              data-testid="review-session-detail-code-input"
            />
            {codeError && <p data-testid="review-session-detail-code-error">{codeError}</p>}
            <button type="submit" data-testid="review-session-detail-code-submit">
              {t('reviewSession.detail.codeSubmitLabel')}
            </button>
          </form>
        </section>
      )}

      {isDraft && (
        <section>
          {completeError && (
            <p data-testid="review-session-detail-complete-error">{completeError}</p>
          )}
          {unreviewedCodes && unreviewedCodes.length > 0 && (
            <div data-testid="review-session-detail-unreviewed-gaps">
              <p>{t('reviewSession.detail.unreviewedGapsTitle')}</p>
              <ul>
                {unreviewedCodes.map((elementCode) => (
                  <li key={elementCode}>
                    <Link
                      to={`/review-sessions/${sessionId}/elements/${encodeURIComponent(elementCode)}`}
                      data-testid={`review-session-detail-gap-link-${elementCode}`}
                    >
                      {t('reviewSession.detail.unreviewedGapsElementLink', { code: elementCode })}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            data-testid="review-session-detail-complete"
            onClick={requestComplete}
            disabled={completing}
          >
            {t('reviewSession.detail.completeLabel')}
          </button>

          {discardError && <p data-testid="review-session-detail-discard-error">{discardError}</p>}
          <button
            type="button"
            data-testid="review-session-detail-discard"
            onClick={requestDiscard}
            disabled={discarding}
          >
            {t('reviewSession.detail.discardLabel')}
          </button>
        </section>
      )}

      {/* One dialog mounted at a time — same collision-avoidance rationale
          as ReviewTemplateDetailPage.tsx's Activate/Delete pair. */}
      {pendingComplete && (
        <ConfirmDialog
          open={pendingComplete}
          title={t('reviewSession.detail.completeConfirmTitle')}
          message={t('reviewSession.detail.completeConfirmMessage')}
          onConfirm={() => void confirmComplete()}
          onCancel={() => setPendingComplete(false)}
        />
      )}
      {pendingDiscard && (
        <ConfirmDialog
          open={pendingDiscard}
          title={t('reviewSession.detail.discardConfirmTitle')}
          message={t('reviewSession.detail.discardConfirmMessage')}
          onConfirm={() => void confirmDiscard()}
          onCancel={() => setPendingDiscard(false)}
        />
      )}
    </main>
  );
}
