import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewHistoryApi from '../api/review-history';
import { ReviewDocumentPage } from './ReviewDocumentPage';

vi.mock('../api/review-history');

const mockedReadReviewDocument = vi.mocked(reviewHistoryApi.readReviewDocument);

const SESSION_ID = 'session-1';

const document: reviewHistoryApi.ReviewDocument = {
  id: SESSION_ID,
  communityId: 'c1',
  communityName: 'Community One',
  template: { name: 'Extinguisher check', elementType: 'EXTINGUISHER', frequency: 'ANNUAL', version: 1 },
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
  },
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
    expect(screen.getByTestId('review-document-letterhead-legal-name')).toHaveTextContent('ACME S.L.');
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

    expect(screen.getByTestId('review-document-session-community')).toHaveTextContent('Community One');
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

    expect(screen.queryByTestId('review-document-session-template-version')).not.toBeInTheDocument();
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
});
