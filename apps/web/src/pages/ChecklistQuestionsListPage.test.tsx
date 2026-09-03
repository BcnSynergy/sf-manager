import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as checklistQuestionApi from '../api/checklist-question';
import { ChecklistQuestionsListPage } from './ChecklistQuestionsListPage';

vi.mock('../api/checklist-question');

const mockedListChecklistQuestions = vi.mocked(checklistQuestionApi.listChecklistQuestions);
const mockedSoftDeleteChecklistQuestion = vi.mocked(
  checklistQuestionApi.softDeleteChecklistQuestion,
);

function renderPage() {
  return render(
    <MemoryRouter>
      <ChecklistQuestionsListPage />
    </MemoryRouter>,
  );
}

const questionOne = {
  id: 'question-1',
  elementType: 'EXTINGUISHER' as const,
  frequencies: ['QUARTERLY' as const],
  text: 'Check the pressure gauge',
};

describe('ChecklistQuestionsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight (spec: distinct loading state)', () => {
    mockedListChecklistQuestions.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('checklist-question-list-loading')).toBeInTheDocument();
  });

  it('shows a distinct empty-pool state that invites creating the first question (spec: Empty-pool state is first-class)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('checklist-question-list-empty')).toBeInTheDocument();
  });

  it('shows a distinct error state, not blank or loading (spec: Error state on fetch failure)', async () => {
    mockedListChecklistQuestions.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('checklist-question-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('checklist-question-list-loading')).not.toBeInTheDocument();
  });

  it("renders a question's elementType, frequency tags and verbatim text, grouped by elementType (spec: Admin views a populated pool)", async () => {
    mockedListChecklistQuestions.mockResolvedValue([questionOne]);

    renderPage();

    const group = await screen.findByTestId('checklist-question-group-EXTINGUISHER');
    expect(group).toHaveTextContent('Fire extinguisher');
    expect(group).not.toHaveTextContent('EXTINGUISHER');

    const row = await screen.findByTestId(`checklist-question-list-row-${questionOne.id}`);
    expect(row).toHaveTextContent('Check the pressure gauge');
    expect(row).toHaveTextContent('Quarterly');
    expect(row).not.toHaveTextContent('QUARTERLY');
  });

  it('renders question text verbatim even if it resembles a translation key (spec: Question Text Is Rendered Verbatim)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([
      { ...questionOne, id: 'question-2', text: 'common.error.network' },
    ]);

    renderPage();

    const row = await screen.findByTestId('checklist-question-list-row-question-2');
    expect(row).toHaveTextContent('common.error.network');
  });

  it('requires confirmation before soft-deleting, and the confirm copy does not imply a blocking dependency (spec: Confirmed Soft-Delete)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([questionOne]);

    renderPage();

    fireEvent.click(await screen.findByTestId(`checklist-question-list-delete-${questionOne.id}`));

    expect(mockedSoftDeleteChecklistQuestion).not.toHaveBeenCalled();
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog.textContent).not.toMatch(/template|reference|depend/i);
  });

  it('removes the row from the list without a manual reload after confirmed soft-delete (spec: Confirmed soft-delete removes the question from the list)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([questionOne]);
    mockedSoftDeleteChecklistQuestion.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByTestId(`checklist-question-list-delete-${questionOne.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockedSoftDeleteChecklistQuestion).toHaveBeenCalledWith(questionOne.id));
    await waitFor(() =>
      expect(
        screen.queryByTestId(`checklist-question-list-row-${questionOne.id}`),
      ).not.toBeInTheDocument(),
    );
    expect(mockedListChecklistQuestions).toHaveBeenCalledTimes(1);
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    mockedListChecklistQuestions.mockResolvedValue([questionOne]);

    renderPage();

    fireEvent.click(await screen.findByTestId(`checklist-question-list-delete-${questionOne.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedSoftDeleteChecklistQuestion).not.toHaveBeenCalled();
    expect(screen.getByTestId(`checklist-question-list-row-${questionOne.id}`)).toBeInTheDocument();
  });

  it('shows a "New checklist question" link pointing to /checklist-questions/new', async () => {
    mockedListChecklistQuestions.mockResolvedValue([questionOne]);

    renderPage();

    const link = await screen.findByTestId('checklist-question-list-create-link');
    expect(link).toHaveAttribute('href', '/checklist-questions/new');
  });

  it('shows a per-row "Edit" link pointing to /checklist-questions/:id/edit', async () => {
    mockedListChecklistQuestions.mockResolvedValue([questionOne]);

    renderPage();

    const link = await screen.findByTestId(`checklist-question-list-edit-${questionOne.id}`);
    expect(link).toHaveAttribute('href', `/checklist-questions/${questionOne.id}/edit`);
  });
});
