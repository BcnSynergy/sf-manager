import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewHistoryApi from '../api/review-history';
import { ReviewHistoryPage } from './ReviewHistoryPage';

vi.mock('../api/review-history');

const mockedListReviewHistory = vi.mocked(reviewHistoryApi.listReviewHistory);

const row = {
  id: 'session-1',
  communityId: 'c1',
  communityName: 'Maple Court',
  performedById: 'u1',
  performedByEmail: 'tech@sf-manager.example',
  startedAt: '2026-09-01T00:00:00.000Z',
  completedAt: '2026-09-01T01:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review-history']}>
      <Routes>
        <Route path="/review-history" element={<ReviewHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the history request is in flight', () => {
    mockedListReviewHistory.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-history-loading')).toBeInTheDocument();
  });

  it('shows an empty state when there is no history, not an error', async () => {
    mockedListReviewHistory.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('review-history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('review-history-error')).not.toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the request fails', async () => {
    mockedListReviewHistory.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-history-error')).toBeInTheDocument();
    expect(screen.queryByTestId('review-history-loading')).not.toBeInTheDocument();
  });

  it('renders every returned row, in the returned order, with no client-side filtering', async () => {
    const rowTwo = { ...row, id: 'session-2', communityName: 'Oak Court' };
    mockedListReviewHistory.mockResolvedValue([row, rowTwo]);

    renderPage();

    const rows = await screen.findAllByTestId(/^review-history-row-/);
    expect(rows.map((element) => element.getAttribute('data-testid'))).toEqual([
      'review-history-row-session-1',
      'review-history-row-session-2',
    ]);
  });

  it('shows each row a link to its read-only detail view', async () => {
    mockedListReviewHistory.mockResolvedValue([row]);

    renderPage();

    const link = await screen.findByTestId(`review-history-open-${row.id}`);
    expect(link).toHaveAttribute('href', `/review-history/${row.id}`);
  });

  it('shows the community name for each row', async () => {
    mockedListReviewHistory.mockResolvedValue([row]);

    renderPage();

    expect(await screen.findByTestId(`review-history-community-${row.id}`)).toHaveTextContent(
      'Maple Court',
    );
  });

  it('shows a neutral placeholder when communityName is empty (soft-deleted community)', async () => {
    mockedListReviewHistory.mockResolvedValue([{ ...row, communityName: '' }]);

    renderPage();

    const cell = await screen.findByTestId(`review-history-community-${row.id}`);
    expect(cell.textContent).not.toBe('');
  });

  // review-history-company-scope spec "A multi-performer caller sees who
  // performed each row" / design.md Decision 8: the Performer column
  // renders for every role, no role-conditional variant.
  it('shows the performer email for each row', async () => {
    mockedListReviewHistory.mockResolvedValue([row]);

    renderPage();

    expect(await screen.findByTestId(`review-history-performer-${row.id}`)).toHaveTextContent(
      'tech@sf-manager.example',
    );
  });

  it('shows a neutral placeholder when performedByEmail is empty (unresolvable performer)', async () => {
    mockedListReviewHistory.mockResolvedValue([{ ...row, performedByEmail: '' }]);

    renderPage();

    const cell = await screen.findByTestId(`review-history-performer-${row.id}`);
    expect(cell.textContent).not.toBe('');
  });

  // spec "A manager's company-wide list is rendered unfiltered": a
  // multi-technician, multi-community result renders every row with no
  // client-side narrowing by community, performer or date.
  it("renders a manager's company-wide, multi-technician result unfiltered", async () => {
    const rowTwo = {
      ...row,
      id: 'session-2',
      communityId: 'c2',
      communityName: 'Oak Court',
      performedById: 'u2',
      performedByEmail: 'other-tech@sf-manager.example',
    };
    mockedListReviewHistory.mockResolvedValue([row, rowTwo]);

    renderPage();

    const rows = await screen.findAllByTestId(/^review-history-row-/);
    expect(rows).toHaveLength(2);
    expect(await screen.findByTestId(`review-history-performer-${row.id}`)).toHaveTextContent(
      'tech@sf-manager.example',
    );
    expect(await screen.findByTestId(`review-history-performer-${rowTwo.id}`)).toHaveTextContent(
      'other-tech@sf-manager.example',
    );
  });
});
