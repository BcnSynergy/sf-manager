import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewSessionApi from '../api/review-session';
import { ReviewSessionElementPage } from './ReviewSessionElementPage';

vi.mock('../api/review-session');

const mockedResolveElementByCode = vi.mocked(reviewSessionApi.resolveElementByCode);
const mockedRecordEntry = vi.mocked(reviewSessionApi.recordEntry);

const SESSION_ID = 'session-1';
const CODE = '23456789AB';

const resolved = {
  element: { id: 'element-1', code: CODE, name: 'Lobby extinguisher', location: 'Lobby' },
  questions: [
    { questionId: 'q1', order: 0, text: 'Is it charged?' },
    { questionId: 'q2', order: 1, text: 'Is the seal intact?' },
  ],
  entry: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/review-sessions/${SESSION_ID}/elements/${CODE}`]}>
      <Routes>
        <Route
          path="/review-sessions/:sessionId/elements/:code"
          element={<ReviewSessionElementPage />}
        />
        <Route
          path="/review-sessions/:sessionId"
          element={<div data-testid="detail-page">detail</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewSessionElementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the resolve request is in flight', () => {
    mockedResolveElementByCode.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-session-element-loading')).toBeInTheDocument();
  });

  // review-session-ui spec "Rejected Codes Get One Uniform Message": the
  // same code+status combination renders the same message regardless of
  // the underlying server rejection cause.
  it('shows the identical error message for every rejected-code cause', async () => {
    const causes = [
      new ApiError(404, 'ELEMENT_NOT_FOUND'),
      Object.assign(new ApiError(404, 'ELEMENT_NOT_FOUND'), {
        message: 'This code belongs to another community',
      }),
      Object.assign(new ApiError(404, 'ELEMENT_NOT_FOUND'), {
        message: 'This element has been decommissioned',
      }),
    ];

    const renderedMessages: string[] = [];
    for (const cause of causes) {
      mockedResolveElementByCode.mockRejectedValueOnce(cause);
      const { unmount } = renderPage();
      const errorNode = await screen.findByTestId('review-session-element-error');
      renderedMessages.push(errorNode.textContent ?? '');
      unmount();
    }

    expect(new Set(renderedMessages).size).toBe(1);
  });

  it('renders the frozen questions in snapshot order, each with three answer options', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);

    renderPage();

    const q1 = await screen.findByTestId('review-session-element-question-q1');
    expect(q1).toHaveTextContent('Is it charged?');
    expect(screen.getByTestId('review-session-element-answer-q1-YES')).toBeInTheDocument();
    expect(screen.getByTestId('review-session-element-answer-q1-NO')).toBeInTheDocument();
    expect(
      screen.getByTestId('review-session-element-answer-q1-NOT_APPLICABLE'),
    ).toBeInTheDocument();
  });

  it('saves answers, shows a confirmation, and offers to continue to code entry', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);
    mockedRecordEntry.mockResolvedValue({
      inspectableElementId: 'element-1',
      reviewed: true,
      observations: null,
      answers: [
        { questionId: 'q1', answer: 'YES' },
        { questionId: 'q2', answer: 'YES' },
      ],
      recordedAt: '2026-09-08T00:00:00.000Z',
    });

    renderPage();

    await screen.findByTestId('review-session-element-question-q1');
    fireEvent.click(screen.getByTestId('review-session-element-answer-q1-YES'));
    fireEvent.click(screen.getByTestId('review-session-element-answer-q2-YES'));
    fireEvent.click(screen.getByTestId('review-session-element-save'));

    await waitFor(() =>
      expect(mockedRecordEntry).toHaveBeenCalledWith(SESSION_ID, 'element-1', {
        answers: [
          { questionId: 'q1', value: 'YES' },
          { questionId: 'q2', value: 'YES' },
        ],
      }),
    );
    expect(await screen.findByTestId('review-session-element-saved')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('review-session-element-continue'));
    expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
  });

  it('marks the element unreviewed with a reason instead of answering', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);
    mockedRecordEntry.mockResolvedValue({
      inspectableElementId: 'element-1',
      reviewed: false,
      observations: 'Room sealed, could not access',
      answers: [],
      recordedAt: '2026-09-08T00:00:00.000Z',
    });

    renderPage();

    await screen.findByTestId('review-session-element-question-q1');
    fireEvent.click(screen.getByTestId('review-session-element-mark-unreviewed'));
    fireEvent.change(screen.getByTestId('review-session-element-observations'), {
      target: { value: 'Room sealed, could not access' },
    });
    fireEvent.click(screen.getByTestId('review-session-element-save'));

    await waitFor(() =>
      expect(mockedRecordEntry).toHaveBeenCalledWith(SESSION_ID, 'element-1', {
        observations: 'Room sealed, could not access',
      }),
    );
    expect(await screen.findByTestId('review-session-element-saved')).toBeInTheDocument();
  });

  it('keeps the entered answers on screen when the save request fails', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);
    mockedRecordEntry.mockRejectedValue(new ApiError(0));

    renderPage();

    await screen.findByTestId('review-session-element-question-q1');
    fireEvent.click(screen.getByTestId('review-session-element-answer-q1-YES'));
    fireEvent.click(screen.getByTestId('review-session-element-answer-q2-NO'));
    fireEvent.click(screen.getByTestId('review-session-element-save'));

    expect(await screen.findByTestId('review-session-element-save-error')).toBeInTheDocument();
    expect(
      (screen.getByTestId('review-session-element-answer-q1-YES') as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByTestId('review-session-element-answer-q2-NO') as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByTestId('review-session-element-saved')).not.toBeInTheDocument();
  });
});
