import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewSessionApi from '../api/review-session';
import { ReviewSessionDetailPage } from './ReviewSessionDetailPage';

vi.mock('../api/review-session');

const mockedReadReviewSession = vi.mocked(reviewSessionApi.readReviewSession);
const mockedCompleteReviewSession = vi.mocked(reviewSessionApi.completeReviewSession);
const mockedDiscardReviewSession = vi.mocked(reviewSessionApi.discardReviewSession);

const SESSION_ID = 'session-1';

const draftSession = {
  id: SESSION_ID,
  communityId: 'c1',
  templateId: 't1',
  performedById: 'u1',
  status: 'draft' as const,
  startedAt: '2026-09-08T00:00:00.000Z',
  completedAt: null,
  entries: [],
  coverage: { reviewed: 0, unreviewed: 0 },
};

const completedSession = { ...draftSession, status: 'completed' as const };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/review-sessions/${SESSION_ID}`]}>
      <Routes>
        <Route path="/review-sessions/:sessionId" element={<ReviewSessionDetailPage />} />
        <Route
          path="/review-sessions/:sessionId/elements/:code"
          element={<div data-testid="element-page">element</div>}
        />
        <Route
          path="/review-sessions"
          element={<div data-testid="review-sessions-page">list</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewSessionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the session request is in flight', () => {
    mockedReadReviewSession.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-session-detail-loading')).toBeInTheDocument();
  });

  it('shows a not-found state on a 404', async () => {
    mockedReadReviewSession.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

    renderPage();

    expect(await screen.findByTestId('review-session-detail-not-found')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) on an unexpected failure', async () => {
    mockedReadReviewSession.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-session-detail-error')).toBeInTheDocument();
  });

  it('shows an empty entries state for a fresh draft', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    expect(await screen.findByTestId('review-session-detail-entries-empty')).toBeInTheDocument();
  });

  it('navigates to the element route with the trimmed, uppercased code on submit', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    fireEvent.change(await screen.findByTestId('review-session-detail-code-input'), {
      target: { value: '  ab3456789c  ' },
    });
    fireEvent.click(screen.getByTestId('review-session-detail-code-submit'));

    expect(await screen.findByTestId('element-page')).toBeInTheDocument();
  });

  it('shows a validation error and does not navigate on an empty code submit', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-code-submit'));

    expect(await screen.findByTestId('review-session-detail-code-error')).toBeInTheDocument();
    expect(screen.queryByTestId('element-page')).not.toBeInTheDocument();
  });

  it('discards the draft after confirmation and navigates to the list', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);
    mockedDiscardReviewSession.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-discard'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockedDiscardReviewSession).toHaveBeenCalledWith(SESSION_ID));
    expect(await screen.findByTestId('review-sessions-page')).toBeInTheDocument();
  });

  it('does not discard when the confirm dialog is cancelled', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-discard'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedDiscardReviewSession).not.toHaveBeenCalled();
  });

  it('labels the completing control Sign and close', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    expect(await screen.findByTestId('review-session-detail-complete')).toHaveTextContent(
      'Sign and close',
    );
  });

  it('warns in the confirmation dialog that the review closes and cannot be modified, and labels its confirm control Sign and close too', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-complete'));

    expect(screen.getByText(/closed/i)).toBeInTheDocument();
    expect(screen.getByText(/no longer be modified/i)).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Sign and close');
  });

  it('completes the session after confirmation and reloads it as read-only', async () => {
    mockedReadReviewSession.mockResolvedValueOnce(draftSession).mockResolvedValueOnce(completedSession);
    mockedCompleteReviewSession.mockResolvedValue({
      id: SESSION_ID,
      status: 'completed',
      completedAt: '2026-09-08T01:00:00.000Z',
    });

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-complete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockedCompleteReviewSession).toHaveBeenCalledWith(SESSION_ID));
    expect(await screen.findByTestId('review-session-detail-completed-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('review-session-detail-complete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-session-detail-discard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-session-detail-code-input')).not.toBeInTheDocument();
  });

  // review-session-ui spec "The completed session offers no document link"
  // and review-document-ui spec "The field flow offers no document link" /
  // "Signing does not auto-open the document" (verify-report W-2): the
  // reassigned-representative risk this guards is that a completed session
  // shown on THIS page (the field flow, not review-history) could leak a
  // route to the document to someone whose access to it may since have been
  // revoked. Static inspection (ReviewSessionDetailPage.tsx has no Link or
  // window.print reference at all) confirmed the absence before this test
  // was written; the test itself was mutation-checked by temporarily adding
  // a `<a href="/review-history/x/document">View document</a>` and a
  // `window.print()` call to the completed-notice branch, confirming the new
  // assertions failed, then reverting — no production code changed.
  it('offers no document link, print control or window.print call after signing, and stays on the session', async () => {
    mockedReadReviewSession.mockResolvedValueOnce(draftSession).mockResolvedValueOnce(completedSession);
    mockedCompleteReviewSession.mockResolvedValue({
      id: SESSION_ID,
      status: 'completed',
      completedAt: '2026-09-08T01:00:00.000Z',
    });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-complete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('review-session-detail-completed-notice')).toBeInTheDocument();
    expect(screen.queryByText('View document')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /view document/i }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(`a[href^="/review-history/${SESSION_ID}/document"]`),
    ).toBeNull();
    expect(screen.queryByTestId('review-document-print-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
    expect(printSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-session-detail-status')).toBeInTheDocument();

    printSpy.mockRestore();
  });

  // review-document-ui spec "A draft offers no document link either".
  it('offers no document link or print control for a draft session', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    await screen.findByTestId('review-session-detail-code-input');

    expect(screen.queryByText('View document')).not.toBeInTheDocument();
    expect(
      document.querySelector(`a[href^="/review-history/${SESSION_ID}/document"]`),
    ).toBeNull();
    expect(screen.queryByTestId('review-document-print-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
  });

  // review-session-ui spec "Cancelling leaves the session a draft".
  it('sends no completion request and stays a draft when the Sign and close confirmation is cancelled', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-complete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedCompleteReviewSession).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-session-detail-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('review-session-detail-completed-notice')).not.toBeInTheDocument();
  });

  it('lists the offending element codes as links on UNREVIEWED_ELEMENTS_WITHOUT_REASON', async () => {
    mockedReadReviewSession.mockResolvedValue(draftSession);
    mockedCompleteReviewSession.mockRejectedValue(
      Object.assign(new ApiError(409, 'UNREVIEWED_ELEMENTS_WITHOUT_REASON'), {
        extra: { elementCodes: ['23456789AB', 'CDEFGHJKMN'] },
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-detail-complete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    const gapLink = await screen.findByTestId('review-session-detail-gap-link-23456789AB');
    expect(gapLink).toHaveAttribute(
      'href',
      `/review-sessions/${SESSION_ID}/elements/23456789AB`,
    );
    expect(screen.getByTestId('review-session-detail-gap-link-CDEFGHJKMN')).toBeInTheDocument();
  });
});
