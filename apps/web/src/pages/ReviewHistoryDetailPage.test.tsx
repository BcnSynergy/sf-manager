import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewHistoryApi from '../api/review-history';
import { ReviewHistoryDetailPage } from './ReviewHistoryDetailPage';

vi.mock('../api/review-history');

const mockedReadReviewHistory = vi.mocked(reviewHistoryApi.readReviewHistory);

const SESSION_ID = 'session-1';

const detail = {
  id: SESSION_ID,
  communityId: 'c1',
  templateId: 't1',
  performedById: 'u1',
  status: 'completed' as const,
  startedAt: '2026-09-01T00:00:00.000Z',
  completedAt: '2026-09-01T01:00:00.000Z',
  entries: [
    {
      inspectableElementId: 'e1',
      elementCode: 'AB3456789C',
      reviewed: true,
      observations: null,
      answers: [{ questionId: 'q1', answer: 'YES' as const }],
      recordedAt: '2026-09-01T00:30:00.000Z',
    },
    {
      inspectableElementId: 'e2',
      elementCode: null,
      reviewed: false,
      observations: 'Access blocked',
      answers: [],
      recordedAt: '2026-09-01T00:45:00.000Z',
    },
  ],
  coverage: { reviewed: 1, unreviewed: 1 },
  questions: [{ questionId: 'q1', order: 1, text: 'Is the extinguisher charged?' }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/review-history/${SESSION_ID}`]}>
      <Routes>
        <Route path="/review-history/:sessionId" element={<ReviewHistoryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewHistoryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the detail request is in flight', () => {
    mockedReadReviewHistory.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-history-detail-loading')).toBeInTheDocument();
  });

  it('shows a uniform error message on a 404 (unreachable session)', async () => {
    mockedReadReviewHistory.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

    renderPage();

    expect(await screen.findByTestId('review-history-detail-error')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) on an unexpected failure', async () => {
    mockedReadReviewHistory.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-history-detail-error')).toBeInTheDocument();
  });

  it('renders each entry with its answers, paired with the snapshotted question wording', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const entry = await screen.findByTestId('review-history-detail-entry-e1');
    expect(entry).toHaveTextContent('Is the extinguisher charged?');
    expect(entry).toHaveTextContent('Yes');
    expect(entry).not.toHaveTextContent('YES');
  });

  it('renders the observations for an unreviewed entry', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const observations = await screen.findByTestId('review-history-detail-observations-e2');
    expect(observations).toHaveTextContent('Access blocked');
  });

  it('renders the element code when present', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const entry = await screen.findByTestId('review-history-detail-entry-e1');
    expect(entry).toHaveTextContent('AB3456789C');
  });

  it('renders a neutral localized label instead of a blank code when elementCode is null', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const codeCell = await screen.findByTestId('review-history-detail-entry-code-e2');
    expect(codeCell.textContent).not.toBe('');
    expect(codeCell.textContent).not.toBe('null');
  });

  it('renders no mutation control of any kind — this is a read-only history view', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    await screen.findByTestId('review-history-detail-entry-e1');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.querySelector('form')).not.toBeInTheDocument();
    expect(document.querySelector('input')).not.toBeInTheDocument();
  });
});
