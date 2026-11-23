import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  listReviewHistoryPhotos,
  readReviewDocument,
  reviewDocumentLogoUrl,
  reviewHistoryPhotoUrl,
  type ReviewDocument,
  type ReviewDocumentEntry,
  type ReviewDocumentLetterhead,
  type ReviewHistoryPhoto,
} from '../api/review-history';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapAnswerValueToLabelKey } from '../review-session/answer-value-labels';
import {
  isProfileIncomplete,
  type ProfileFields,
} from '../organization-profile/is-profile-incomplete';
import { formatDocumentDate, formatDocumentDateTime } from '../review-session/format-date';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'unreachable' | 'error';

// EN-227: the photo list of one document, tagged with its session id so a
// result is only ever used for the document it belongs to.
type PhotosResult =
  | { sessionId: string; state: 'loaded'; photos: ReviewHistoryPhoto[] }
  | { sessionId: string; state: 'error' };

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

// spec: review-document-ui "Document Page Content" / "A Blank or Incomplete
// Profile Still Prints". The letterhead has no per-field label — it prints
// like a physical letterhead, not a data table — so only non-blank values
// render, in a fixed field order.
const LETTERHEAD_FIELDS: (keyof ProfileFields)[] = [
  'name',
  'legalName',
  'taxId',
  'address',
  'phone',
  'email',
];

// name -> name, legalName -> legal-name, taxId -> tax-id (mirrors
// OrganizationProfilePage.tsx's toTestIdSegment).
function letterheadTestId(field: keyof ProfileFields): string {
  return `review-document-letterhead-${field.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

// review-document-ui "The Letterhead Shows the Organization Logo": the logo
// heads the letterhead on screen and in print. `hasLogo` can be true while
// the file is gone (the logo read then answers 404), so an image that fails
// to load is dropped without an error, like a blank field.
function LetterheadRegion({
  letterhead,
  sessionId,
}: {
  letterhead: ReviewDocumentLetterhead;
  sessionId: string;
}) {
  const { t } = useTranslation();
  const [logoFailed, setLogoFailed] = useState(false);
  const incomplete = isProfileIncomplete(letterhead);
  const filledFields = LETTERHEAD_FIELDS.filter((field) => letterhead[field] !== '');
  const showLogo = letterhead.hasLogo && !logoFailed;

  return (
    <section data-testid="review-document-letterhead">
      {incomplete && (
        <p data-testid="review-document-letterhead-warning" data-print-hide>
          {t('reviewDocument.letterhead.incompleteWarning')}
        </p>
      )}
      {(showLogo || filledFields.length > 0) && (
        <div data-testid="review-document-letterhead-content">
          {showLogo && (
            <img
              className="sf-letterhead-logo"
              src={reviewDocumentLogoUrl(sessionId)}
              alt={t('reviewDocument.letterhead.logoAlt')}
              onError={() => setLogoFailed(true)}
              data-testid="review-document-letterhead-logo"
            />
          )}
          {filledFields.map((field) => (
            <p key={field} data-testid={letterheadTestId(field)}>
              {letterhead[field]}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

// spec: review-document-ui "Document Page Content" (session data row).
// `communityName`/`maintenanceCompanyName` may separately be the
// defensive-fallback empty string (an id that resolves no row at all) —
// distinct from `maintenanceCompanyName === null`, which means no company
// was recorded and the line is omitted entirely (design.md "Fallbacks and
// letterhead").
function SessionDataRegion({ document, locale }: { document: ReviewDocument; locale: string }) {
  const { t } = useTranslation();

  return (
    <section data-testid="review-document-session-data">
      <h2>{t('reviewDocument.session.title')}</h2>
      <dl>
        <dt>{t('reviewDocument.session.communityLabel')}</dt>
        <dd data-testid="review-document-session-community">
          {document.communityName || t('reviewDocument.session.communityUnknown')}
        </dd>
        <dt>{t('reviewDocument.session.elementTypeLabel')}</dt>
        <dd data-testid="review-document-session-element-type">
          {t(mapElementTypeToLabelKey(document.template.elementType))}
        </dd>
        <dt>{t('reviewDocument.session.frequencyLabel')}</dt>
        <dd data-testid="review-document-session-frequency">
          {t(mapReviewFrequencyToLabelKey(document.template.frequency))}
        </dd>
        <dt>{t('reviewDocument.session.templateNameLabel')}</dt>
        <dd data-testid="review-document-session-template-name">{document.template.name}</dd>
        {document.template.version !== null && (
          <>
            <dt>{t('reviewDocument.session.templateVersionLabel')}</dt>
            <dd data-testid="review-document-session-template-version">
              {document.template.version}
            </dd>
          </>
        )}
        <dt>{t('reviewDocument.session.startedAtLabel')}</dt>
        <dd data-testid="review-document-session-started-at">
          {formatDocumentDate(new Date(document.startedAt), locale)}
        </dd>
        {document.completedAt !== null && (
          <>
            <dt>{t('reviewDocument.session.completedAtLabel')}</dt>
            <dd data-testid="review-document-session-completed-at">
              {formatDocumentDate(new Date(document.completedAt), locale)}
            </dd>
          </>
        )}
        {document.maintenanceCompanyName !== null && (
          <>
            <dt>{t('reviewDocument.session.companyLabel')}</dt>
            <dd data-testid="review-document-session-company">
              {document.maintenanceCompanyName || t('reviewDocument.session.companyUnknown')}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

// spec: review-document-ui "Document Page Content" (signature footer). The
// signer is always the performer (design.md "Signing is copy, not state") —
// no separate `signedBy` field exists; `performedByEmail` may be the
// defensive-fallback empty string, rendered as a placeholder like every
// other unresolvable-lookup field on this page.
function SignatureFooter({ document, locale }: { document: ReviewDocument; locale: string }) {
  const { t } = useTranslation();

  return (
    <footer data-testid="review-document-signature">
      <p data-testid="review-document-signed-by">
        {t('reviewDocument.footer.signedByLabel', {
          email: document.performedByEmail || t('reviewDocument.footer.emailUnknown'),
        })}
      </p>
      {document.completedAt !== null && (
        <p data-testid="review-document-signed-at">
          {t('reviewDocument.footer.signedAtLabel', {
            date: formatDocumentDateTime(new Date(document.completedAt), locale),
          })}
        </p>
      )}
    </footer>
  );
}

// spec: review-document-ui "Document Page Content" (record region). The
// server already returns entries and answers in their final deterministic
// order (design.md "Entry enrichment and order", PR 6) — this component MUST
// NOT hide, re-sort or truncate them. A deactivated or soft-deleted element
// still carries its real `elementCode`/`elementName`/`elementLocation` (the
// name directory resolves all three together); only an id that resolves no
// row at all has `elementCode === null`, which is the one signal this page
// uses to render the neutral label instead — mirrors
// `ReviewHistoryDetailPage.tsx`'s identical `elementCode ?? ...` fallback.
function RecordEntry({
  entry,
  questionTextById,
  sessionId,
  photos,
}: {
  entry: ReviewDocumentEntry;
  questionTextById: ReadonlyMap<string, string>;
  sessionId: string;
  photos: readonly ReviewHistoryPhoto[];
}) {
  const { t } = useTranslation();
  const elementLabel = entry.elementCode ?? t('reviewDocument.record.elementUnknown');

  return (
    <li data-testid={`review-document-record-entry-${entry.inspectableElementId}`}>
      <p data-testid={`review-document-record-entry-identity-${entry.inspectableElementId}`}>
        {entry.elementCode !== null
          ? `${entry.elementCode} — ${entry.elementName} — ${entry.elementLocation}`
          : t('reviewDocument.record.elementUnknown')}
      </p>
      {entry.reviewed ? (
        <ul>
          {entry.answers.map((answer) => (
            <li key={answer.questionId}>
              {questionTextById.get(answer.questionId) ??
                t('reviewDocument.record.questionTextUnknown')}
              : {t(mapAnswerValueToLabelKey(answer.answer))}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {t('reviewDocument.record.unreviewedLabel')}{' '}
          <span data-testid={`review-document-record-entry-reason-${entry.inspectableElementId}`}>
            {entry.observations ?? ''}
          </span>
        </p>
      )}
      {/* EN-227: the element's photos print with its entry, oldest first.
          Plain images, no link: the document offers no action but print. */}
      {photos.length > 0 && (
        <div
          className="review-document-photos"
          data-testid={`review-document-record-photos-${entry.inspectableElementId}`}
        >
          {photos.map((photo, index) => (
            <img
              key={photo.id}
              className="review-document-photo"
              src={reviewHistoryPhotoUrl(sessionId, photo.id)}
              alt={t('reviewDocument.record.photoAlt', {
                number: index + 1,
                element: elementLabel,
              })}
            />
          ))}
        </div>
      )}
    </li>
  );
}

// spec: "A completed session with zero entries still renders" — the record
// region shows no entry and no error, never an empty-state message: an
// empty `<ul>` already satisfies "no entry"; adding placeholder copy here
// would be a claim the spec does not make.
function RecordRegion({
  document,
  photos,
  photosPending,
  photosFailed,
}: {
  document: ReviewDocument;
  photos: readonly ReviewHistoryPhoto[];
  photosPending: boolean;
  photosFailed: boolean;
}) {
  const { t } = useTranslation();
  const questionTextById = new Map(
    document.questions.map((question) => [question.questionId, question.text]),
  );
  const photosByElementId = new Map<string, ReviewHistoryPhoto[]>();
  for (const photo of photos) {
    const forElement = photosByElementId.get(photo.inspectableElementId) ?? [];
    forElement.push(photo);
    photosByElementId.set(photo.inspectableElementId, forElement);
  }
  // EN-228: a photo whose element has no entry prints in one "Other photos"
  // group after the entries, so the printed document leaves no photo out.
  const entryElementIds = new Set(document.entries.map((entry) => entry.inspectableElementId));
  const otherPhotos = photos.filter((photo) => !entryElementIds.has(photo.inspectableElementId));

  return (
    <section data-testid="review-document-record">
      <h2>{t('reviewDocument.record.title')}</h2>
      {/* EN-227: printed, not print-hidden, so a printed document never
          leaves its photos out without saying so. */}
      {/* EN-231: printed too. The print control waits for the photo list,
          but the browser's own print shortcut does not, so a document
          printed before the list arrives says its photos are missing. */}
      {photosPending && (
        <p data-testid="review-document-record-photos-loading">
          {t('reviewDocument.record.photosLoading')}
        </p>
      )}
      {photosFailed && (
        <p data-testid="review-document-record-photos-error">
          {t('reviewDocument.record.photosLoadError')}
        </p>
      )}
      <ul data-testid="review-document-record-entries">
        {document.entries.map((entry) => (
          <RecordEntry
            key={entry.inspectableElementId}
            entry={entry}
            questionTextById={questionTextById}
            sessionId={document.id}
            photos={photosByElementId.get(entry.inspectableElementId) ?? []}
          />
        ))}
      </ul>
      {otherPhotos.length > 0 && (
        <div
          className="review-document-other-photos"
          data-testid="review-document-record-other-photos"
        >
          <h3>{t('reviewDocument.record.otherPhotosTitle')}</h3>
          <div className="review-document-photos">
            {otherPhotos.map((photo, index) => (
              <img
                key={photo.id}
                className="review-document-photo"
                src={reviewHistoryPhotoUrl(document.id, photo.id)}
                alt={t('reviewDocument.record.otherPhotoAlt', { number: index + 1 })}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function ReviewDocumentPage() {
  const { t, i18n } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [document, setDocument] = useState<ReviewDocument | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<string>('common.error.network');
  const [photosResult, setPhotosResult] = useState<PhotosResult | null>(null);

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

  // EN-227: the photos load once the document itself has loaded (a document
  // the caller cannot open needs no photo request), through the history
  // photo route, which has the same scope as the document read.
  const loadedSessionId = document?.id;
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

  const currentPhotos = photosResult?.sessionId === document.id ? photosResult : null;

  // `.review-document-print` (index.css, mirrors `.label-print`'s
  // convention) scopes the print rules that hide every `[data-print-hide]`
  // element (page heading, incomplete-profile warning, print button) and
  // force black-on-white colors, so this class only reaches the loaded
  // state — the loading/unreachable/error states are never printed.
  return (
    <main className="review-document-print">
      <h1 data-print-hide>{t('reviewDocument.title')}</h1>
      <div data-testid="review-document-content" data-review-document-id={document.id}>
        <LetterheadRegion
          key={document.id}
          letterhead={document.letterhead}
          sessionId={document.id}
        />
        <SessionDataRegion document={document} locale={i18n.language} />
        <RecordRegion
          document={document}
          photos={currentPhotos?.state === 'loaded' ? currentPhotos.photos : []}
          photosPending={currentPhotos === null}
          photosFailed={currentPhotos?.state === 'error'}
        />
        <SignatureFooter document={document} locale={i18n.language} />
      </div>
      {/* spec: "Print Through the Browser, Document Only" / "The Document
          Page Offers No Other Action" — the ONLY control besides ordinary
          navigation, and the only one hidden from the printed output along
          with the page heading and the incomplete-profile warning. */}
      <button
        type="button"
        data-testid="review-document-print-button"
        data-print-hide
        // EN-227: printing before the photo list arrives would leave the
        // photos out of the printed document.
        disabled={currentPhotos === null}
        onClick={() => window.print()}
      >
        {t('reviewDocument.print.button')}
      </button>
    </main>
  );
}
