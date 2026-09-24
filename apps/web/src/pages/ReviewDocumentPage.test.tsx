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
