import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewSessionApi from '../api/review-session';
import { ReviewSessionsPage } from './ReviewSessionsPage';

vi.mock('../api/review-session');

const mockedListOwnReviewSessions = vi.mocked(reviewSessionApi.listOwnReviewSessions);

const session = {
  id: 'session-1',
  communityId: 'c1',
  templateId: 't1',
  performedById: 'u1',
  status: 'draft' as const,
  startedAt: '2026-09-08T00:00:00.000Z',
  completedAt: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review-sessions']}>
      <Routes>
        <Route path="/review-sessions" element={<ReviewSessionsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewSessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListOwnReviewSessions.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-sessions-loading')).toBeInTheDocument();
  });

  it('shows an empty state when there are no drafts', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('review-sessions-empty')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the list request fails', async () => {
    mockedListOwnReviewSessions.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-sessions-error')).toBeInTheDocument();
    expect(screen.queryByTestId('review-sessions-loading')).not.toBeInTheDocument();
  });

  it('renders a resumable draft with a link to its detail route', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([session]);

    renderPage();

    const link = await screen.findByTestId(`review-sessions-resume-${session.id}`);
    expect(link).toHaveAttribute('href', `/review-sessions/${session.id}`);
  });

  it('always shows a Start-a-session link', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([]);

    renderPage();

    const link = await screen.findByTestId('review-sessions-start-link');
    expect(link).toHaveAttribute('href', '/review-sessions/new');
  });

  it('always shows a link to review history', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([]);

    renderPage();

    const link = await screen.findByTestId('review-history-entry-link');
    expect(link).toHaveAttribute('href', '/review-history');
  });
});
