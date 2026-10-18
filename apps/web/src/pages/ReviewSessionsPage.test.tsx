import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
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

  it('names the table by its heading and scopes every column header', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([session]);

    renderPage();

    const table = await screen.findByRole('table', { name: i18n.t('reviewSession.entry.title') });
    expect(table.querySelector('caption')).toHaveClass('visually-hidden');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    expect(table.querySelector('[scope="row"]')).toBeNull();
  });

  it('puts the heading in a page header and the loading, empty and error messages in empty-state boxes', async () => {
    mockedListOwnReviewSessions.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderPage();
    expect(screen.getByTestId('review-sessions-loading')).toHaveClass('sf-empty');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveClass(
      'sf-page-header',
    );
    unmount();

    mockedListOwnReviewSessions.mockResolvedValueOnce([]);
    const empty = renderPage();
    expect(await screen.findByTestId('review-sessions-empty')).toHaveClass('sf-empty');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveClass(
      'sf-page-header',
    );
    empty.unmount();

    mockedListOwnReviewSessions.mockRejectedValueOnce(new ApiError(0));
    renderPage();
    expect(await screen.findByTestId('review-sessions-error')).toHaveClass('sf-empty');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveClass(
      'sf-page-header',
    );
  });

  it('shows Start as the primary button and History as a secondary one in the page header', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([]);

    renderPage();

    const start = await screen.findByTestId('review-sessions-start-link');
    const history = screen.getByTestId('review-history-entry-link');
    expect(start).toHaveClass('sf-btn', 'sf-btn-primary');
    expect(history).toHaveClass('sf-btn');
    expect(history).not.toHaveClass('sf-btn-primary');
    expect(start.parentElement).toHaveClass('sf-actions');
    expect(history.parentElement).toBe(start.parentElement);
    expect(start.closest('header')).toHaveClass('sf-page-header');
  });

  it('wraps the table, shows Resume as a secondary button and the start time as data', async () => {
    mockedListOwnReviewSessions.mockResolvedValue([session]);

    renderPage();

    const table = await screen.findByRole('table', { name: i18n.t('reviewSession.entry.title') });
    expect(table.parentElement).toHaveClass('sf-table-wrap');
    const resume = screen.getByTestId(`review-sessions-resume-${session.id}`);
    expect(resume.tagName).toBe('A');
    expect(resume).toHaveClass('sf-btn');
    expect(resume).not.toHaveClass('sf-btn-primary');
    expect(resume.parentElement).toHaveClass('sf-actions');
    expect(
      within(screen.getByTestId(`review-sessions-row-${session.id}`)).getByText(session.startedAt),
    ).toHaveClass('sf-data');
  });
});
