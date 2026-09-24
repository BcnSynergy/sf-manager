import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  readReviewDocument,
  type ReviewDocument,
  type ReviewDocumentEntry,
  type ReviewDocumentLetterhead,
} from '../api/review-history';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapAnswerValueToLabelKey } from '../review-session/answer-value-labels';
import { isProfileIncomplete } from '../organization-profile/is-profile-incomplete';
import { formatDocumentDate, formatDocumentDateTime } from '../review-session/format-date';
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

// spec: review-document-ui "Document Page Content" / "A Blank or Incomplete
// Profile Still Prints". The letterhead has no per-field label — it prints
// like a physical letterhead, not a data table — so only non-blank values
// render, in a fixed field order.
const LETTERHEAD_FIELDS: (keyof ReviewDocumentLetterhead)[] = [
  'name',
  'legalName',
  'taxId',
  'address',
  'phone',
  'email',
];

// name -> name, legalName -> legal-name, taxId -> tax-id (mirrors
// OrganizationProfilePage.tsx's toTestIdSegment).
function letterheadTestId(field: keyof ReviewDocumentLetterhead): string {
  return `review-document-letterhead-${field.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

function LetterheadRegion({ letterhead }: { letterhead: ReviewDocumentLetterhead }) {
  const { t } = useTranslation();
  const incomplete = isProfileIncomplete(letterhead);
  const filledFields = LETTERHEAD_FIELDS.filter((field) => letterhead[field] !== '');

  return (
    <section data-testid="review-document-letterhead">
      {incomplete && (
        <p data-testid="review-document-letterhead-warning" data-print-hide>
          {t('reviewDocument.letterhead.incompleteWarning')}
        </p>
      )}
      {filledFields.length > 0 && (
        <div data-testid="review-document-letterhead-content">
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
}: {
  entry: ReviewDocumentEntry;
  questionTextById: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();

  return (
    <li
      data-testid={`review-document-record-entry-${entry.inspectableElementId}`}
    >
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
          <span
            data-testid={`review-document-record-entry-reason-${entry.inspectableElementId}`}
          >
            {entry.observations ?? ''}
          </span>
        </p>
      )}
    </li>
  );
}

// spec: "A completed session with zero entries still renders" — the record
// region shows no entry and no error, never an empty-state message: an
// empty `<ul>` already satisfies "no entry"; adding placeholder copy here
// would be a claim the spec does not make.
function RecordRegion({ document }: { document: ReviewDocument }) {
  const { t } = useTranslation();
  const questionTextById = new Map(
    document.questions.map((question) => [question.questionId, question.text]),
  );

  return (
    <section data-testid="review-document-record">
      <h2>{t('reviewDocument.record.title')}</h2>
      <ul data-testid="review-document-record-entries">
        {document.entries.map((entry) => (
          <RecordEntry
            key={entry.inspectableElementId}
            entry={entry}
            questionTextById={questionTextById}
          />
        ))}
      </ul>
    </section>
  );
}

export function ReviewDocumentPage() {
  const { t, i18n } = useTranslation();
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

  // `.review-document-print` (index.css, mirrors `.label-print`'s
  // convention) scopes the print rules that hide every `[data-print-hide]`
  // element (page heading, incomplete-profile warning, print button) and
  // force black-on-white colors, so this class only reaches the loaded
  // state — the loading/unreachable/error states are never printed.
  return (
    <main className="review-document-print">
      <h1 data-print-hide>{t('reviewDocument.title')}</h1>
      <div data-testid="review-document-content" data-review-document-id={document.id}>
        <LetterheadRegion letterhead={document.letterhead} />
        <SessionDataRegion document={document} locale={i18n.language} />
        <RecordRegion document={document} />
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
        onClick={() => window.print()}
      >
        {t('reviewDocument.print.button')}
      </button>
    </main>
  );
}
