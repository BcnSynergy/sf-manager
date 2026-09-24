import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError } from '../api/client';
import { readReviewDocument, type ReviewDocument } from '../api/review-history';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'unreachable' | 'error';

// review-document-ui spec "The Document Page Is Gated on the Five History
// Roles" / "Loading and Unreachable States". PR 10 is the page SHELL only:
// route, fetch, loading, and the 404-vs-network/5xx split. The letterhead,
// session-data, record and print regions (design.md "Web surface") ship in
// PR 11-12; the "View document" entry link ships in PR 13. Until then this
// page is reachable only by a hand-typed URL, matching tasks.md 10.5's
// "page still URL-only until PR 13".
//
// Unlike `ReviewHistoryDetailPage.tsx` (whose single ApiError.status/.code
// pair, REVIEW_SESSION_NOT_FOUND, always means "unreachable"),
// `mapApiErrorToMessageKey` from `review-session/error-messages.ts` maps
// EVERY unrecognized status/code — including a network failure (status 0)
// and any 5xx — to the SAME generic `common.error.network` key it already
// uses elsewhere in this app. Routing that through the document page's own
// `reviewDocument.unreachable` message would silently fold "the server is
// down" into "this session does not exist" — exactly what spec's "A network
// error or a 5xx is not folded into the uniform message" scenario forbids.
// So this page checks `ApiError.status === 404` FIRST, dedicated to the
// document's own uniform unreachable copy (nonexistent, out-of-scope and
// draft are server-side indistinguishable, always this one 404/
// REVIEW_SESSION_NOT_FOUND pair), and only falls through to the shared
// mapper for every other status.
const HTTP_NOT_FOUND = 404;

export function ReviewDocumentPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [document, setDocument] = useState<ReviewDocument | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<string>('common.error.network');

  const loadDocument = useCallback(() => {
    if (sessionId === undefined) {
      // Every setState call must live inside a promise continuation, even
      // on this synchronous guard clause — mirrors
      // ReviewHistoryDetailPage.tsx's identical guard (react-hooks
      // no-setState-in-effect rule).
      return Promise.resolve().then(() => {
        setErrorMessageKey('common.error.network');
        setLoadState('error');
      });
    }

    return readReviewDocument(sessionId)
      .then((loaded) => {
        setDocument(loaded);
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError(0);
        if (apiError.status === HTTP_NOT_FOUND) {
          setLoadState('unreachable');
          return;
        }
        setErrorMessageKey(mapApiErrorToMessageKey(apiError));
        setLoadState('error');
      });
  }, [sessionId]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewDocument.title')}</h1>
        <p data-testid="review-document-loading">{t('reviewDocument.loading')}</p>
      </main>
    );
  }

  if (loadState === 'unreachable') {
    return (
      <main>
        <h1>{t('reviewDocument.title')}</h1>
        <p data-testid="review-document-unreachable">{t('reviewDocument.unreachable')}</p>
      </main>
    );
  }

  if (loadState === 'error' || document === null) {
    return (
      <main>
        <h1>{t('reviewDocument.title')}</h1>
        <p data-testid="review-document-error">{t(errorMessageKey)}</p>
      </main>
    );
  }

  // Header, record and print regions ship in PR 11/12 — this shell renders
  // only a stable content anchor for now, keyed off the loaded document so
  // the fetch result is not discarded.
  return (
    <main>
      <h1>{t('reviewDocument.title')}</h1>
      <div data-testid="review-document-content" data-review-document-id={document.id} />
    </main>
  );
}
