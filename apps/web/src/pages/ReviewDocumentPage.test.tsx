import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as reviewHistoryApi from '../api/review-history';
import { ReviewDocumentPage, ReviewDocumentView } from './ReviewDocumentPage';

// Only the fetch is mocked: the logo URL helper stays real, so the tests
// see the address the browser would request.
vi.mock('../api/review-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/review-history')>()),
  readReviewDocument: vi.fn(),
  listReviewHistoryPhotos: vi.fn(),
}));

const mockedReadReviewDocument = vi.mocked(reviewHistoryApi.readReviewDocument);
const mockedListPhotos = vi.mocked(reviewHistoryApi.listReviewHistoryPhotos);

// EN-227: no photos unless a test says otherwise; no document read left over
// from an earlier test.
beforeEach(() => {
  mockedReadReviewDocument.mockReset();
  mockedListPhotos.mockClear();
  mockedListPhotos.mockResolvedValue([]);
});

const SESSION_ID = 'session-1';

const document: reviewHistoryApi.ReviewDocument = {
  id: SESSION_ID,
  communityId: 'c1',
  communityName: 'Community One',
  template: {
    name: 'Extinguisher check',
    elementType: 'EXTINGUISHER',
    frequency: 'ANNUAL',
    version: 1,
  },
  maintenanceCompanyName: 'Acme Maintenance',
  performedById: 'u1',
  performedByEmail: 'tech@sf-manager.example',
  status: 'completed',
  startedAt: '2026-09-01T00:00:00.000Z',
  completedAt: '2026-09-01T01:00:00.000Z',
  entries: [],
  questions: [],
  letterhead: {
    name: 'ACME',
    legalName: 'ACME S.L.',
    taxId: 'B12345678',
    address: 'Main St 1',
    phone: '111222333',
    email: 'org@sf-manager.example',
    hasLogo: false,
  },
  hasSignature: false,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/review-history/${SESSION_ID}/document`]}>
      <Routes>
        <Route path="/review-history/:sessionId/document" element={<ReviewDocumentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// review-document-ui spec "Loading and Unreachable States": PR 10 covers
// only the page shell — the loading indicator and the split between the
// uniform 404 message (nonexistent/out-of-scope/draft, all collapsed
// server-side to REVIEW_SESSION_NOT_FOUND) and the network/5xx path through
// `mapApiErrorToMessageKey`. Full document content (letterhead, session
// data, record, print) ships in PR 11-12; this suite deliberately does not
// assert on it.
describe('ReviewDocumentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the document request is in flight', () => {
    mockedReadReviewDocument.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-document-loading')).toBeInTheDocument();
  });

  it('shows the uniform unreachable message on a 404 for a nonexistent session', async () => {
    mockedReadReviewDocument.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

    renderPage();

    expect(await screen.findByTestId('review-document-unreachable')).toBeInTheDocument();
  });

  it('shows the identical uniform message on a 404 for an out-of-scope session', async () => {
    // The server collapses every rejection cause (nonexistent, out of
    // scope, draft) to the same REVIEW_SESSION_NOT_FOUND/404 pair — the
    // client cannot and must not distinguish them.
    mockedReadReviewDocument.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

    renderPage();

    const unreachable = await screen.findByTestId('review-document-unreachable');
    expect(unreachable).toBeInTheDocument();
  });

  it('does not fold a network error into the uniform 404 message', async () => {
    mockedReadReviewDocument.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-document-error')).toBeInTheDocument();
    expect(screen.queryByTestId('review-document-unreachable')).not.toBeInTheDocument();
  });

  it('does not fold a 5xx response into the uniform 404 message', async () => {
    mockedReadReviewDocument.mockRejectedValue(new ApiError(500));

    renderPage();

    expect(await screen.findByTestId('review-document-error')).toBeInTheDocument();
    expect(screen.queryByTestId('review-document-unreachable')).not.toBeInTheDocument();
  });

  it('renders once the document loads', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();

    expect(await screen.findByTestId('review-document-content')).toBeInTheDocument();
  });
});

// review-document-ui spec "A Blank or Incomplete Profile Still Prints": the
// letterhead renders only non-blank fields; the warning appears on screen
// (marked `data-print-hide`, PR12 wires the actual `@media print` rule) iff
// at least one field is blank; nothing renders at all when every field is
// blank, but the warning still does (all-blank implies at-least-one-blank).
describe('letterhead region', () => {
  function withLetterhead(
    letterhead: Partial<reviewHistoryApi.ReviewDocumentLetterhead>,
  ): reviewHistoryApi.ReviewDocument {
    return { ...document, letterhead: { ...document.letterhead, ...letterhead } };
  }

  it('renders every letterhead field when the profile is complete, with no incomplete warning', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.getByTestId('review-document-letterhead-name')).toHaveTextContent('ACME');
    expect(screen.getByTestId('review-document-letterhead-legal-name')).toHaveTextContent(
      'ACME S.L.',
    );
    expect(screen.getByTestId('review-document-letterhead-tax-id')).toHaveTextContent('B12345678');
    expect(screen.getByTestId('review-document-letterhead-address')).toHaveTextContent('Main St 1');
    expect(screen.getByTestId('review-document-letterhead-phone')).toHaveTextContent('111222333');
    expect(screen.getByTestId('review-document-letterhead-email')).toHaveTextContent(
      'org@sf-manager.example',
    );
    expect(screen.queryByTestId('review-document-letterhead-warning')).not.toBeInTheDocument();
  });

  it('omits a blank field and shows a print-hidden incomplete warning when at least one field is blank', async () => {
    mockedReadReviewDocument.mockResolvedValue(withLetterhead({ address: '' }));

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.queryByTestId('review-document-letterhead-address')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-letterhead-name')).toBeInTheDocument();
    const warning = screen.getByTestId('review-document-letterhead-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveAttribute('data-print-hide');
  });

  it('renders no letterhead content at all when every field is blank, but still shows the warning', async () => {
    mockedReadReviewDocument.mockResolvedValue(
      withLetterhead({ name: '', legalName: '', taxId: '', address: '', phone: '', email: '' }),
    );

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.queryByTestId('review-document-letterhead-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-letterhead-warning')).toBeInTheDocument();
  });

  // review-document-ui "The Letterhead Shows the Organization Logo"
  it('shows the logo from the document logo route, printed with the letterhead', async () => {
    mockedReadReviewDocument.mockResolvedValue(withLetterhead({ hasLogo: true }));

    renderPage();
    await screen.findByTestId('review-document-content');

    const logo = screen.getByTestId('review-document-letterhead-logo');
    expect(logo).toHaveAttribute(
      'src',
      expect.stringMatching(new RegExp(`/review-history/${SESSION_ID}/document/logo$`)),
    );
    expect(logo).toHaveAccessibleName('Organization logo');
    expect(logo).not.toHaveAttribute('data-print-hide');
    expect(screen.getByTestId('review-document-letterhead-content')).toContainElement(logo);
  });

  it('shows no logo when the organization has none', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.queryByTestId('review-document-letterhead-logo')).not.toBeInTheDocument();
  });

  it('drops a logo that fails to load, with no error, keeping the text fields', async () => {
    mockedReadReviewDocument.mockResolvedValue(withLetterhead({ hasLogo: true }));

    renderPage();
    await screen.findByTestId('review-document-content');
    fireEvent.error(screen.getByTestId('review-document-letterhead-logo'));

    expect(screen.queryByTestId('review-document-letterhead-logo')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-letterhead-name')).toHaveTextContent('ACME');
  });

  it('a blank profile with a logo shows the logo alone, and still the warning', async () => {
    mockedReadReviewDocument.mockResolvedValue(
      withLetterhead({
        name: '',
        legalName: '',
        taxId: '',
        address: '',
        phone: '',
        email: '',
        hasLogo: true,
      }),
    );

    renderPage();
    await screen.findByTestId('review-document-content');

    const content = screen.getByTestId('review-document-letterhead-content');
    expect(within(content).getByTestId('review-document-letterhead-logo')).toBeInTheDocument();
    expect(within(content).queryAllByRole('paragraph')).toHaveLength(0);
    expect(screen.getByTestId('review-document-letterhead-warning')).toBeInTheDocument();
  });

  it('a logo that failed on one document still shows on the next one', async () => {
    mockedReadReviewDocument.mockImplementation((sessionId) =>
      Promise.resolve({
        ...withLetterhead({ hasLogo: true }),
        id: sessionId,
      }),
    );
    const router = createMemoryRouter(
      [{ path: '/review-history/:sessionId/document', element: <ReviewDocumentPage /> }],
      { initialEntries: [`/review-history/${SESSION_ID}/document`] },
    );

    render(<RouterProvider router={router} />);
    fireEvent.error(await screen.findByTestId('review-document-letterhead-logo'));
    expect(screen.queryByTestId('review-document-letterhead-logo')).not.toBeInTheDocument();

    await act(() => router.navigate('/review-history/session-2/document'));

    const logo = await screen.findByTestId('review-document-letterhead-logo');
    expect(logo).toHaveAttribute(
      'src',
      expect.stringMatching(/\/review-history\/session-2\/document\/logo$/),
    );
  });

  it('a blank profile whose logo fails to load renders no letterhead content', async () => {
    mockedReadReviewDocument.mockResolvedValue(
      withLetterhead({
        name: '',
        legalName: '',
        taxId: '',
        address: '',
        phone: '',
        email: '',
        hasLogo: true,
      }),
    );

    renderPage();
    await screen.findByTestId('review-document-content');
    fireEvent.error(screen.getByTestId('review-document-letterhead-logo'));

    expect(screen.queryByTestId('review-document-letterhead-content')).not.toBeInTheDocument();
  });
});

// review-document-ui spec "Document Page Content" (session data row): community
// name, localized element type and frequency, template name/version, start
// and completion dates, and the company line omitted when the session has no
// attributed company.
describe('session data region', () => {
  it('renders community name, localized element type/frequency, template name/version and dates', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.getByTestId('review-document-session-community')).toHaveTextContent(
      'Community One',
    );
    expect(screen.getByTestId('review-document-session-element-type')).toBeInTheDocument();
    expect(screen.getByTestId('review-document-session-frequency')).toBeInTheDocument();
    expect(screen.getByTestId('review-document-session-template-name')).toHaveTextContent(
      'Extinguisher check',
    );
    expect(screen.getByTestId('review-document-session-template-version')).toHaveTextContent('1');
    expect(screen.getByTestId('review-document-session-started-at')).toBeInTheDocument();
    expect(screen.getByTestId('review-document-session-completed-at')).toBeInTheDocument();
    expect(screen.getByTestId('review-document-session-company')).toHaveTextContent(
      'Acme Maintenance',
    );
  });

  it('omits the company line entirely when the session has no attributed company', async () => {
    mockedReadReviewDocument.mockResolvedValue({ ...document, maintenanceCompanyName: null });

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.queryByTestId('review-document-session-company')).not.toBeInTheDocument();
  });

  it('renders a placeholder, not a blank cell, for a defensive-fallback empty community/company name', async () => {
    mockedReadReviewDocument.mockResolvedValue({
      ...document,
      communityName: '',
      maintenanceCompanyName: '',
    });

    renderPage();
    await screen.findByTestId('review-document-content');

    const community = screen.getByTestId('review-document-session-community');
    expect(community).not.toHaveTextContent('');
    expect(community.textContent).not.toBe('');
    const company = screen.getByTestId('review-document-session-company');
    expect(company.textContent).not.toBe('');
  });

  it('omits the template version row when the template carries no version', async () => {
    mockedReadReviewDocument.mockResolvedValue({
      ...document,
      template: { ...document.template, version: null },
    });

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(
      screen.queryByTestId('review-document-session-template-version'),
    ).not.toBeInTheDocument();
  });
});

// review-document-ui spec "Document Page Content" (signature footer): a
// "signed by" label with the performer's email, and the signing date as
// `completedAt`, rendered as date AND time (HH:mm), fixed to Europe/Madrid
// (format-date.ts, PR9).
describe('signature footer', () => {
  it('renders the signer email and the completedAt date and time', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.getByTestId('review-document-signed-by')).toHaveTextContent(
      'tech@sf-manager.example',
    );
    const signedAt = screen.getByTestId('review-document-signed-at');
    // 2026-09-01T01:00:00.000Z is 03:00 in Europe/Madrid (CEST, UTC+2).
    expect(signedAt).toHaveTextContent('03:00');
  });

  it('renders a placeholder, not a blank cell, for a defensive-fallback empty performer email', async () => {
    mockedReadReviewDocument.mockResolvedValue({ ...document, performedByEmail: '' });

    renderPage();
    await screen.findByTestId('review-document-content');

    const signedBy = screen.getByTestId('review-document-signed-by');
    expect(signedBy.textContent).not.toBe('');
  });

  // review-document-ui "The Signature Footer Shows the Signature Image"
  it('shows the signature image from the document signature route, printed with the footer', async () => {
    mockedReadReviewDocument.mockResolvedValue({ ...document, hasSignature: true });

    renderPage();
    await screen.findByTestId('review-document-content');

    const image = screen.getByTestId('review-document-signature-image');
    expect(image).toHaveAttribute(
      'src',
      expect.stringMatching(new RegExp(`/review-history/${SESSION_ID}/document/signature$`)),
    );
    expect(image).toHaveAccessibleName('Signature of the signer');
    expect(image).not.toHaveAttribute('data-print-hide');
    expect(screen.getByTestId('review-document-signature')).toContainElement(image);
    expect(screen.getByTestId('review-document-signed-by')).toBeInTheDocument();
  });

  it('shows no signature image when the session has none', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.queryByTestId('review-document-signature-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-signed-by')).toBeInTheDocument();
    expect(screen.getByTestId('review-document-signed-at')).toBeInTheDocument();
  });

  it('drops a signature image that fails to load, with no error, keeping the rest of the footer', async () => {
    mockedReadReviewDocument.mockResolvedValue({ ...document, hasSignature: true });

    renderPage();
    await screen.findByTestId('review-document-content');
    fireEvent.error(screen.getByTestId('review-document-signature-image'));

    expect(screen.queryByTestId('review-document-signature-image')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-signed-by')).toHaveTextContent(
      'tech@sf-manager.example',
    );
    expect(screen.getByTestId('review-document-signed-at')).toBeInTheDocument();
  });

  it('a signature that failed on one document still shows on the next one', async () => {
    mockedReadReviewDocument.mockImplementation((sessionId) =>
      Promise.resolve({ ...document, hasSignature: true, id: sessionId }),
    );
    const router = createMemoryRouter(
      [{ path: '/review-history/:sessionId/document', element: <ReviewDocumentPage /> }],
      { initialEntries: [`/review-history/${SESSION_ID}/document`] },
    );

    render(<RouterProvider router={router} />);
    fireEvent.error(await screen.findByTestId('review-document-signature-image'));
    expect(screen.queryByTestId('review-document-signature-image')).not.toBeInTheDocument();

    await act(() => router.navigate('/review-history/session-2/document'));

    expect(await screen.findByTestId('review-document-signature-image')).toHaveAttribute(
      'src',
      expect.stringMatching(/\/review-history\/session-2\/document\/signature$/),
    );
  });

  it.each([
    ['en', 'Signature of the signer'],
    ['es', 'Firma de quien firma'],
    ['ca', 'Signatura de qui signa'],
  ])('localizes the signature alt text in %s', async (language, alt) => {
    await i18n.changeLanguage(language);
    try {
      mockedReadReviewDocument.mockResolvedValue({ ...document, hasSignature: true });

      renderPage();
      await screen.findByTestId('review-document-content');

      expect(screen.getByTestId('review-document-signature-image')).toHaveAccessibleName(alt);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

// review-document-ui spec "Document Page Content" (record region): every
// entry in the server's own order, its element's code/name/location (real
// values even for a deactivated/soft-deleted element), and its answers or
// recorded reason. `entries`/`answers` ordering is done server-side (PR 6) —
// this page MUST NOT hide, re-sort or truncate them.
//
// The server order here is DELIBERATELY hostile to any naive client-side
// sort: `e-zz` (code "ZZ9") comes before `e-aa` (code "AA1") — the opposite
// of code-ascending order — and `e-zz`'s own answers are given
// question-order-2-then-1 ("q-zulu" before "q-alpha"), the opposite of both
// the frozen template's `order` field and alphabetical questionId order. A
// test that only used an already-sorted fixture (e.g. codes already
// ascending) could pass even if this component secretly re-sorted by code
// or by question order — this fixture cannot.
const recordDocument: reviewHistoryApi.ReviewDocument = {
  ...document,
  entries: [
    {
      inspectableElementId: 'e-zz',
      elementCode: 'ZZ9',
      elementName: 'Extinguisher Z',
      elementLocation: 'Floor 9',
      reviewed: true,
      observations: null,
      answers: [
        { questionId: 'q-zulu', answer: 'NO' },
        { questionId: 'q-alpha', answer: 'YES' },
      ],
      recordedAt: '2026-09-01T00:05:00.000Z',
    },
    {
      inspectableElementId: 'e-aa',
      elementCode: 'AA1',
      elementName: 'Extinguisher A',
      elementLocation: 'Floor 1',
      reviewed: true,
      observations: null,
      answers: [{ questionId: 'q-alpha', answer: 'YES' }],
      recordedAt: '2026-09-01T00:10:00.000Z',
    },
    {
      inspectableElementId: 'e-unknown',
      elementCode: null,
      elementName: null,
      elementLocation: null,
      reviewed: false,
      observations: 'Access blocked',
      answers: [],
      recordedAt: '2026-09-01T00:20:00.000Z',
    },
  ],
  questions: [
    { questionId: 'q-alpha', order: 1, text: 'Is it charged?' },
    { questionId: 'q-zulu', order: 2, text: 'Is the hose intact?' },
  ],
};

describe('record region', () => {
  it('renders every entry, and every answer within an entry, in the exact server order — not code-ascending, not question-order — proving no client-side sort', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);

    renderPage();
    await screen.findByTestId('review-document-content');

    const entryIds = screen
      .getAllByTestId(/^review-document-record-entry-/)
      .filter((element) => element.tagName === 'LI')
      .map((element) => element.dataset.testid);
    expect(entryIds).toEqual([
      'review-document-record-entry-e-zz',
      'review-document-record-entry-e-aa',
      'review-document-record-entry-e-unknown',
    ]);

    const firstIdentity = screen.getByTestId('review-document-record-entry-identity-e-zz');
    expect(firstIdentity).toHaveTextContent('ZZ9');
    expect(firstIdentity).toHaveTextContent('Extinguisher Z');
    expect(firstIdentity).toHaveTextContent('Floor 9');

    const zzAnswers = within(screen.getByTestId('review-document-record-entry-e-zz')).getAllByRole(
      'listitem',
    );
    expect(zzAnswers.map((element) => element.textContent)).toEqual([
      expect.stringContaining('Is the hose intact?'),
      expect.stringContaining('Is it charged?'),
    ]);
  });

  it('renders the real identity for a deactivated or soft-deleted element, not a neutral label', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.getByTestId('review-document-record-entry-identity-e-zz')).toHaveTextContent(
      'ZZ9',
    );
  });

  it('renders a neutral label and the recorded reason for an unreviewed entry with no resolvable element', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);

    renderPage();
    await screen.findByTestId('review-document-content');

    const identity = screen.getByTestId('review-document-record-entry-identity-e-unknown');
    expect(identity.textContent).not.toBe('');
    expect(identity).not.toHaveTextContent('null');
    expect(screen.getByTestId('review-document-record-entry-reason-e-unknown')).toHaveTextContent(
      'Access blocked',
    );
  });

  it('renders no entry and no error for a completed session with zero entries', async () => {
    mockedReadReviewDocument.mockResolvedValue({ ...recordDocument, entries: [] });

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.queryAllByTestId(/^review-document-record-entry-/)).toHaveLength(0);
    expect(screen.queryByTestId('review-document-error')).not.toBeInTheDocument();
  });

  // review-export verify-report S-4: `questionTextById.get(...) ?? answer.questionId`
  // fell back to the RAW question id (a UUID) when the snapshot has no matching
  // question. Mirrors the "no raw identifier shown to users" rule already applied
  // to `elementCode` above — a localized neutral label replaces the id instead.
  it('renders a localized label, not the raw question id, for an answer with no matching question snapshot', async () => {
    mockedReadReviewDocument.mockResolvedValue({
      ...document,
      entries: [
        {
          inspectableElementId: 'e-orphan',
          elementCode: 'AA1',
          elementName: 'Extinguisher A',
          elementLocation: 'Floor 1',
          reviewed: true,
          observations: null,
          answers: [{ questionId: 'q-missing', answer: 'YES' }],
          recordedAt: '2026-09-01T00:10:00.000Z',
        },
      ],
      questions: [],
    });

    renderPage();
    await screen.findByTestId('review-document-content');

    const entry = screen.getByTestId('review-document-record-entry-e-orphan');
    expect(entry).toHaveTextContent('Unknown question');
    expect(entry).not.toHaveTextContent('q-missing');
  });
});

// EN-227: the photos of the review, inside the entry of their element.
describe('record photos', () => {
  const photos = [
    { id: 'p1', inspectableElementId: 'e-aa', createdAt: '2026-09-01T00:01:00.000Z' },
    { id: 'p2', inspectableElementId: 'e-zz', createdAt: '2026-09-01T00:02:00.000Z' },
    { id: 'p3', inspectableElementId: 'e-aa', createdAt: '2026-09-01T00:03:00.000Z' },
  ];

  it("prints each element's photos inside its own entry, in order, from the history photo route, with no link", async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    mockedListPhotos.mockResolvedValue(photos);

    renderPage();
    const aa = await screen.findByTestId('review-document-record-photos-e-aa');

    expect(screen.getByTestId('review-document-record-entry-e-aa')).toContainElement(aa);
    const images = within(aa).getAllByRole('img');
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      reviewHistoryApi.reviewHistoryPhotoUrl(SESSION_ID, 'p1'),
      reviewHistoryApi.reviewHistoryPhotoUrl(SESSION_ID, 'p3'),
    ]);
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      'Photo 1 of AA1',
      'Photo 2 of AA1',
    ]);
    expect(images[0]).not.toHaveAttribute('data-print-hide');
    expect(within(aa).queryAllByRole('link')).toHaveLength(0);
    expect(mockedListPhotos).toHaveBeenCalledWith(SESSION_ID);

    const zz = screen.getByTestId('review-document-record-photos-e-zz');
    expect(screen.getByTestId('review-document-record-entry-e-zz')).toContainElement(zz);
    expect(within(zz).getAllByRole('img')).toHaveLength(1);
    expect(screen.queryByTestId('review-document-record-photos-e-unknown')).not.toBeInTheDocument();
  });

  // EN-228: a photo whose element has no entry prints under "Other photos".
  it('prints a photo whose element has no entry in one "Other photos" group after the entries, with no link', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    mockedListPhotos.mockResolvedValue([
      photos[0],
      { id: 'p8', inspectableElementId: 'e-gone', createdAt: '2026-09-01T00:40:00.000Z' },
    ]);

    renderPage();
    const other = await screen.findByTestId('review-document-record-other-photos');

    expect(within(other).getByRole('heading', { name: 'Other photos' })).toBeInTheDocument();
    const images = within(other).getAllByRole('img');
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      reviewHistoryApi.reviewHistoryPhotoUrl(SESSION_ID, 'p8'),
    ]);
    expect(images[0]).toHaveAttribute('alt', 'Other photo 1');
    expect(within(other).queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByTestId('review-document-record')).toContainElement(other);
    expect(screen.getByTestId('review-document-record-entries')).not.toContainElement(other);
    expect(
      within(screen.getByTestId('review-document-record-photos-e-aa')).getAllByRole('img'),
    ).toHaveLength(1);
  });

  it('prints the "Other photos" group even for a document without entries', async () => {
    mockedReadReviewDocument.mockResolvedValue({ ...recordDocument, entries: [] });
    mockedListPhotos.mockResolvedValue([photos[0]]);

    renderPage();
    const other = await screen.findByTestId('review-document-record-other-photos');

    expect(within(other).getAllByRole('img')).toHaveLength(1);
    expect(
      within(screen.getByTestId('review-document-record-entries')).queryAllByRole('listitem'),
    ).toHaveLength(0);
  });

  it('prints no "Other photos" group when every photo has its entry', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    mockedListPhotos.mockResolvedValue(photos);

    renderPage();
    await screen.findByTestId('review-document-record-photos-e-aa');

    expect(screen.queryByTestId('review-document-record-other-photos')).not.toBeInTheDocument();
  });

  it('names an element with no resolvable row neutrally in the photo text alternative', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    mockedListPhotos.mockResolvedValue([
      { id: 'p9', inspectableElementId: 'e-unknown', createdAt: '2026-09-01T00:09:00.000Z' },
    ]);

    renderPage();
    const unknown = await screen.findByTestId('review-document-record-photos-e-unknown');

    expect(within(unknown).getByRole('img')).toHaveAttribute('alt', 'Photo 1 of Unknown element');
  });

  it('keeps the document whole and prints one note when the photos cannot be loaded', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    mockedListPhotos.mockRejectedValue(new ApiError(0));

    renderPage();
    const note = await screen.findByTestId('review-document-record-photos-error');

    expect(note).toHaveTextContent('The photos of this review could not be loaded.');
    expect(note).not.toHaveAttribute('data-print-hide');
    expect(screen.getByTestId('review-document-record-entry-e-zz')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByTestId('review-document-print-button')).toBeEnabled();
  });

  it('keeps the print control disabled until the photo list has arrived', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    let resolvePhotos: (value: typeof photos) => void = () => {};
    mockedListPhotos.mockReturnValue(
      new Promise((resolve) => {
        resolvePhotos = resolve;
      }),
    );

    renderPage();
    await screen.findByTestId('review-document-content');
    expect(screen.getByTestId('review-document-print-button')).toBeDisabled();

    await act(async () => {
      resolvePhotos(photos);
      await Promise.resolve();
    });

    expect(screen.getByTestId('review-document-print-button')).toBeEnabled();
  });

  it('prints a loading note while the photo list is pending, and drops it once the list arrives', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    let resolvePhotos: (value: typeof photos) => void = () => {};
    mockedListPhotos.mockReturnValue(
      new Promise((resolve) => {
        resolvePhotos = resolve;
      }),
    );

    renderPage();
    const note = await screen.findByTestId('review-document-record-photos-loading');

    expect(note).toHaveTextContent('Loading the photos of this review...');
    expect(note).not.toHaveAttribute('data-print-hide');
    expect(note.closest('[data-print-hide]')).toBeNull();

    await act(async () => {
      resolvePhotos(photos);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('review-document-record-photos-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-record-photos-e-aa')).toBeInTheDocument();
  });

  it('replaces the loading note with the failure note when the photos cannot be loaded', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);
    let rejectPhotos: (reason: unknown) => void = () => {};
    mockedListPhotos.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPhotos = reject;
      }),
    );

    renderPage();
    await screen.findByTestId('review-document-record-photos-loading');

    await act(async () => {
      rejectPhotos(new ApiError(0));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('review-document-record-photos-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-document-record-photos-error')).toBeInTheDocument();
  });

  it("never shows a previous document's photos, and keeps print disabled, after the route moves to another document", async () => {
    mockedReadReviewDocument.mockImplementation((id) =>
      Promise.resolve({ ...recordDocument, id, communityName: `community-${id}` }),
    );
    mockedListPhotos.mockImplementation((id) =>
      id === SESSION_ID ? Promise.resolve(photos) : new Promise(() => {}),
    );
    const router = createMemoryRouter(
      [{ path: '/review-history/:sessionId/document', element: <ReviewDocumentPage /> }],
      { initialEntries: [`/review-history/${SESSION_ID}/document`] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByTestId('review-document-record-photos-e-aa');
    expect(screen.getByTestId('review-document-print-button')).toBeEnabled();

    await act(() => router.navigate('/review-history/session-2/document'));

    expect(await screen.findByText('community-session-2')).toBeInTheDocument();
    expect(mockedListPhotos).toHaveBeenLastCalledWith('session-2');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    // EN-231: the previous document's answered list never hides the new
    // document's loading note.
    expect(screen.getByTestId('review-document-record-photos-loading')).toBeInTheDocument();
    expect(screen.getByTestId('review-document-print-button')).toBeDisabled();
  });

  it('sends no photo request when the document cannot be opened', async () => {
    mockedReadReviewDocument.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

    renderPage();
    await screen.findByTestId('review-document-unreachable');

    expect(mockedListPhotos).not.toHaveBeenCalled();
  });
});

// review-document-ui spec "Print Through the Browser, Document Only" /
// "The Document Page Offers No Other Action".
describe('print control', () => {
  it('opens the browser print dialog through the single print control, marked print-hidden', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    renderPage();
    await screen.findByTestId('review-document-content');
    const printButton = screen.getByTestId('review-document-print-button');
    expect(printButton).toHaveAttribute('data-print-hide');
    // EN-227: print is enabled once the photo list has arrived.
    await waitFor(() => expect(printButton).toBeEnabled());

    printButton.click();

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('offers no control besides print and ordinary navigation', async () => {
    mockedReadReviewDocument.mockResolvedValue(recordDocument);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('marks the page heading print-hidden, alongside the warning and the print button', async () => {
    mockedReadReviewDocument.mockResolvedValue(document);

    renderPage();
    await screen.findByTestId('review-document-content');

    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('data-print-hide');
  });
});

// EN-232: moving to another session starts that document from its loading
// state; the previous document, or its error, never stays on screen (or
// printable) under the new URL.
describe('session change', () => {
  function renderRoutedPage() {
    const router = createMemoryRouter(
      [{ path: '/review-history/:sessionId/document', element: <ReviewDocumentPage /> }],
      { initialEntries: [`/review-history/${SESSION_ID}/document`] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  it('shows the loading state, with no previous document or print control, while the next document loads', async () => {
    mockedReadReviewDocument.mockImplementation((id) =>
      id === SESSION_ID
        ? Promise.resolve({ ...document, communityName: 'community-session-1' })
        : new Promise(() => {}),
    );
    const router = renderRoutedPage();
    await screen.findByText('community-session-1');

    await act(() => router.navigate('/review-history/session-2/document'));

    expect(screen.getByTestId('review-document-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('review-document-content')).not.toBeInTheDocument();
    expect(screen.queryByText('community-session-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-document-print-button')).not.toBeInTheDocument();
  });

  it('shows the loading state, not the previous unreachable message, while the next document loads', async () => {
    mockedReadReviewDocument.mockImplementation((id) =>
      id === SESSION_ID ? Promise.reject(new ApiError(404)) : new Promise(() => {}),
    );
    const router = renderRoutedPage();
    await screen.findByTestId('review-document-unreachable');

    await act(() => router.navigate('/review-history/session-2/document'));

    expect(screen.getByTestId('review-document-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('review-document-unreachable')).not.toBeInTheDocument();
  });

  // The page remounts its view on a session change, so these tests change
  // `sessionId` on one mounted view to pin the guards the remount alone
  // no longer exercises.
  describe('one mounted view', () => {
    function renderView(sessionId: string) {
      return render(<ReviewDocumentView sessionId={sessionId} />);
    }

    it('drops a document response for a session the view has already left', async () => {
      let resolveB: (value: reviewHistoryApi.ReviewDocument) => void = () => {};
      mockedReadReviewDocument.mockImplementation((id) =>
        id === 'session-b'
          ? new Promise((resolve) => {
              resolveB = resolve;
            })
          : Promise.resolve({ ...document, id, communityName: `community-${id}` }),
      );
      const { rerender } = renderView('session-a');
      await screen.findByText('community-session-a');

      rerender(<ReviewDocumentView sessionId="session-b" />);
      rerender(<ReviewDocumentView sessionId="session-c" />);
      await screen.findByText('community-session-c');

      await act(async () => {
        resolveB({ ...document, id: 'session-b', communityName: 'community-session-b' });
        await Promise.resolve();
      });

      expect(screen.getByText('community-session-c')).toBeInTheDocument();
      expect(screen.queryByText('community-session-b')).not.toBeInTheDocument();
    });

    it('drops a failure for a session the view has already left', async () => {
      let rejectA: (reason: unknown) => void = () => {};
      mockedReadReviewDocument.mockImplementation((id) =>
        id === 'session-a'
          ? new Promise((_resolve, reject) => {
              rejectA = reject;
            })
          : Promise.resolve({ ...document, id, communityName: `community-${id}` }),
      );
      const { rerender } = renderView('session-a');

      rerender(<ReviewDocumentView sessionId="session-b" />);
      await screen.findByText('community-session-b');

      await act(async () => {
        rejectA(new ApiError(404));
        await Promise.resolve();
      });

      expect(screen.getByText('community-session-b')).toBeInTheDocument();
      expect(screen.queryByTestId('review-document-unreachable')).not.toBeInTheDocument();
    });

    it("never shows the previous document's photos while the next document's photo list is pending", async () => {
      mockedReadReviewDocument.mockImplementation((id) =>
        Promise.resolve({ ...recordDocument, id, communityName: `community-${id}` }),
      );
      mockedListPhotos.mockImplementation((id) =>
        id === 'session-a'
          ? Promise.resolve([
              { id: 'p1', inspectableElementId: 'e-aa', createdAt: '2026-09-01T00:01:00.000Z' },
            ])
          : new Promise(() => {}),
      );
      const { rerender } = renderView('session-a');
      await screen.findByTestId('review-document-record-photos-e-aa');

      rerender(<ReviewDocumentView sessionId="session-b" />);
      await screen.findByText('community-session-b');

      expect(screen.queryAllByRole('img')).toHaveLength(0);
      expect(screen.getByTestId('review-document-record-photos-loading')).toBeInTheDocument();
      expect(screen.getByTestId('review-document-print-button')).toBeDisabled();
    });
  });
});
