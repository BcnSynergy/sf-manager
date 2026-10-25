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
const mockedReadReviewSession = vi.mocked(reviewSessionApi.readReviewSession);

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

function sessionWithStatus(status: 'draft' | 'completed') {
  return {
    id: SESSION_ID,
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status,
    startedAt: '2026-09-08T00:00:00.000Z',
    completedAt: status === 'completed' ? '2026-09-09T00:00:00.000Z' : null,
    entries: [],
    coverage: { reviewed: 0, unreviewed: 0 },
  };
}

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

const recordedYesYes = {
  inspectableElementId: 'element-1',
  reviewed: true,
  observations: null,
  answers: [
    { questionId: 'q1', answer: 'YES' as const },
    { questionId: 'q2', answer: 'YES' as const },
  ],
  recordedAt: '2026-09-08T00:00:00.000Z',
};

async function saveYesYes() {
  await screen.findByTestId('review-session-element-question-q1');
  fireEvent.click(screen.getByTestId('review-session-element-answer-q1-YES'));
  fireEvent.click(screen.getByTestId('review-session-element-answer-q2-YES'));
  fireEvent.click(screen.getByTestId('review-session-element-save'));
  await screen.findByTestId('review-session-element-saved');
}

describe('ReviewSessionElementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReadReviewSession.mockResolvedValue(sessionWithStatus('draft'));
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

  it('titles a draft session element as the answer form', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);

    renderPage();

    await screen.findByTestId('review-session-element-save');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Answer element');
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

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the save error again when the same incomplete answers are saved again', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);

    renderPage();

    await screen.findByTestId('review-session-element-question-q1');
    fireEvent.click(screen.getByTestId('review-session-element-answer-q1-YES'));
    fireEvent.click(screen.getByTestId('review-session-element-save'));
    const first = await screen.findByTestId('review-session-element-save-error');
    fireEvent.click(screen.getByTestId('review-session-element-save'));

    const second = screen.getByTestId('review-session-element-save-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
    expect(mockedRecordEntry).not.toHaveBeenCalled();
  });

  // EN-76: a `role="status"` added already filled is not reliably announced,
  // so the confirmation appears inside a region that was there.
  it('shows the save confirmation inside a status region that was on the page before the save', async () => {
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
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByTestId('review-session-element-answer-q1-YES'));
    fireEvent.click(screen.getByTestId('review-session-element-answer-q2-YES'));
    fireEvent.click(screen.getByTestId('review-session-element-save'));

    const saved = await screen.findByTestId('review-session-element-saved');
    expect(saved).not.toHaveAttribute('role');
    expect(region).toContainElement(saved);
    expect(region).toContainElement(screen.getByTestId('review-session-element-continue'));
    expect(screen.getByRole('status')).toBe(region);
  });

  // EN-80: on a long form at phone width a confirmation above the form is
  // out of view of the Save button just pressed.
  it('shows the save confirmation between the questions and the Save button', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);
    mockedRecordEntry.mockResolvedValue(recordedYesYes);

    renderPage();
    await saveYesYes();

    const region = screen.getByRole('status');
    const questions = screen.getByTestId('review-session-element-questions');
    const save = screen.getByTestId('review-session-element-save');
    expect(region).toContainElement(screen.getByTestId('review-session-element-saved'));
    expect(questions.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(region.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  // EN-80: once the user edits after a save, what is on screen is no longer
  // what was saved, so the confirmation and its Continue step go away.
  it.each([
    [
      'changing an answer',
      () => fireEvent.click(screen.getByTestId('review-session-element-answer-q1-NO')),
    ],
    [
      'toggling mark unreviewed',
      () => fireEvent.click(screen.getByTestId('review-session-element-mark-unreviewed')),
    ],
  ])('withdraws the save confirmation after %s', async (_label, edit) => {
    mockedResolveElementByCode.mockResolvedValue(resolved);
    mockedRecordEntry.mockResolvedValue(recordedYesYes);

    renderPage();
    await saveYesYes();
    expect(screen.getByTestId('review-session-element-save')).not.toHaveClass('sf-btn-primary');

    edit();

    expect(screen.queryByTestId('review-session-element-saved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-session-element-continue')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-session-element-save')).toHaveClass('sf-btn-primary');
  });

  it('withdraws the save confirmation after editing the observations', async () => {
    mockedResolveElementByCode.mockResolvedValue(resolved);
    mockedRecordEntry.mockResolvedValue({
      inspectableElementId: 'element-1',
      reviewed: false,
      observations: 'Room sealed',
      answers: [],
      recordedAt: '2026-09-08T00:00:00.000Z',
    });

    renderPage();
    await screen.findByTestId('review-session-element-question-q1');
    fireEvent.click(screen.getByTestId('review-session-element-mark-unreviewed'));
    fireEvent.change(screen.getByTestId('review-session-element-observations'), {
      target: { value: 'Room sealed' },
    });
    fireEvent.click(screen.getByTestId('review-session-element-save'));
    await screen.findByTestId('review-session-element-saved');

    fireEvent.change(screen.getByTestId('review-session-element-observations'), {
      target: { value: 'Room sealed, key missing' },
    });

    expect(screen.queryByTestId('review-session-element-saved')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-session-element-save')).toHaveClass('sf-btn-primary');
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

  describe('design system', () => {
    it('renders the loading and error states in empty-state boxes under a page header, with Back as a secondary action', async () => {
      mockedResolveElementByCode.mockReturnValue(new Promise(() => {}));
      const loading = renderPage();
      expect(screen.getByTestId('review-session-element-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedResolveElementByCode.mockRejectedValue(new ApiError(404, 'ELEMENT_NOT_FOUND'));
      renderPage();
      expect(await screen.findByTestId('review-session-element-error')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      const back = screen.getByTestId('review-session-element-back');
      expect(back).toHaveClass('sf-btn');
      expect(back).not.toHaveClass('sf-btn-primary');
      expect(back.parentElement).toHaveClass('sf-actions');
    });

    it('shows the element in a panel and the form with the save as the primary action', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);
      renderPage();

      const save = await screen.findByTestId('review-session-element-save');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      expect(screen.getByTestId('review-session-element-name').parentElement).toHaveClass(
        'sf-panel',
      );
      expect(screen.getByTestId('review-session-element-location').parentElement).toHaveClass(
        'sf-panel',
      );
      expect(save.closest('form')).toHaveClass('sf-form');
      expect(save).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(save.parentElement).toHaveClass('sf-actions');
    });

    it('renders the questions as field groups of answer choices', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);
      renderPage();

      const question = await screen.findByTestId('review-session-element-question-q1');
      expect(question).toHaveClass('sf-field');
      expect(screen.getByTestId('review-session-element-questions')).toHaveClass('sf-section');
      expect(screen.getByRole('heading', { level: 2 })).toHaveClass('sf-section-title');
      const answer = screen.getByTestId('review-session-element-answer-q1-YES');
      expect(answer.parentElement).toHaveClass('sf-choice');
      expect(
        screen.getByTestId('review-session-element-mark-unreviewed').parentElement,
      ).toHaveClass('sf-choice');
    });

    it('renders the observations as a field group when marking the element unreviewed', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);
      renderPage();

      fireEvent.click(await screen.findByTestId('review-session-element-mark-unreviewed'));

      const observations = screen.getByTestId('review-session-element-observations');
      expect(observations.parentElement).toHaveClass('sf-field');
      expect(
        observations.parentElement?.querySelector(`label[for="${observations.id}"]`),
      ).not.toBeNull();
    });

    it('shows the save confirmation as a success status alert with Continue as the primary action', async () => {
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

      const saved = await screen.findByTestId('review-session-element-saved');
      expect(saved).toHaveClass('sf-alert', 'sf-alert-success');
      const proceed = screen.getByTestId('review-session-element-continue');
      expect(saved).toContainElement(proceed);
      expect(proceed).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(proceed.parentElement).toHaveClass('sf-actions');
      const save = screen.getByTestId('review-session-element-save');
      expect(save).toHaveClass('sf-btn');
      expect(save).not.toHaveClass('sf-btn-primary');
    });

    it('shows the save failure as a danger alert', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);
      mockedRecordEntry.mockRejectedValue(new ApiError(0));
      renderPage();

      await screen.findByTestId('review-session-element-question-q1');
      fireEvent.click(screen.getByTestId('review-session-element-answer-q1-YES'));
      fireEvent.click(screen.getByTestId('review-session-element-answer-q2-YES'));
      fireEvent.click(screen.getByTestId('review-session-element-save'));

      const error = await screen.findByTestId('review-session-element-save-error');
      expect(mockedRecordEntry).toHaveBeenCalled();
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });

  // review-session-ui spec "A completed session still offers no mutating
  // control" (TD-39): the field flow shows a completed session's element
  // read-only instead of the answer form.
  describe('completed session', () => {
    const MUTATING_TEST_IDS = [
      'review-session-element-save',
      'review-session-element-mark-unreviewed',
      'review-session-element-answer-q1-YES',
      'review-session-element-observations',
    ];

    beforeEach(() => {
      mockedReadReviewSession.mockResolvedValue(sessionWithStatus('completed'));
    });

    it('shows the recorded answers read-only with no mutating control', async () => {
      mockedResolveElementByCode.mockResolvedValue({
        ...resolved,
        entry: {
          reviewed: true,
          observations: null,
          answers: [
            { questionId: 'q1', answer: 'YES' },
            { questionId: 'q2', answer: 'NOT_APPLICABLE' },
          ],
          recordedAt: '2026-09-08T00:00:00.000Z',
        },
      });

      renderPage();

      expect(
        await screen.findByTestId('review-session-element-completed-notice'),
      ).toHaveTextContent('This session is completed and read-only.');
      const recorded = screen.getByTestId('review-session-element-recorded-answers');
      expect(recorded).toHaveTextContent('Is it charged?');
      expect(recorded).toHaveTextContent('Yes');
      expect(recorded).toHaveTextContent('Is the seal intact?');
      expect(recorded).toHaveTextContent('Not applicable');
      for (const testId of MUTATING_TEST_IDS) {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(mockedReadReviewSession).toHaveBeenCalledWith(SESSION_ID);
    });

    it('shows an unreviewed entry as not reviewed with its reason', async () => {
      mockedResolveElementByCode.mockResolvedValue({
        ...resolved,
        entry: {
          reviewed: false,
          observations: 'Room sealed, could not access',
          answers: [],
          recordedAt: '2026-09-08T00:00:00.000Z',
        },
      });

      renderPage();

      const unreviewed = await screen.findByTestId('review-session-element-recorded-unreviewed');
      expect(unreviewed).toHaveTextContent('Not reviewed');
      expect(unreviewed).toHaveTextContent('Room sealed, could not access');
      for (const testId of MUTATING_TEST_IDS) {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
    });

    it('says no entry was recorded when the element has none', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);

      renderPage();

      expect(await screen.findByTestId('review-session-element-not-recorded')).toHaveTextContent(
        'No entry was recorded for this element in this session.',
      );
      for (const testId of MUTATING_TEST_IDS) {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
    });

    it('titles the read-only view as the recorded element', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);

      renderPage();

      await screen.findByTestId('review-session-element-completed-notice');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Recorded element');
    });

    it('offers Back to session as the only action', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);

      renderPage();

      const back = await screen.findByTestId('review-session-element-back');
      expect(screen.getAllByRole('button')).toEqual([back]);
      fireEvent.click(back);
      expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
    });

    it('shows the load error when the session cannot be read', async () => {
      mockedResolveElementByCode.mockResolvedValue(resolved);
      mockedReadReviewSession.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

      renderPage();

      expect(await screen.findByTestId('review-session-element-error')).toHaveTextContent(
        'This session could not be found.',
      );
      expect(screen.queryByTestId('review-session-element-save')).not.toBeInTheDocument();
    });
  });
});
