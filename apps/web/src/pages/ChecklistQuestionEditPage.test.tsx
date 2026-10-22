import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as checklistQuestionApi from '../api/checklist-question';
import { ChecklistQuestionEditPage } from './ChecklistQuestionEditPage';

vi.mock('../api/checklist-question');

const mockedListChecklistQuestions = vi.mocked(checklistQuestionApi.listChecklistQuestions);
const mockedUpdateChecklistQuestion = vi.mocked(checklistQuestionApi.updateChecklistQuestion);
const mockedSoftDeleteChecklistQuestion = vi.mocked(
  checklistQuestionApi.softDeleteChecklistQuestion,
);

const QUESTION_ID = 'question-1';

const question = {
  id: QUESTION_ID,
  elementType: 'EXTINGUISHER' as const,
  frequencies: ['QUARTERLY' as const],
  text: 'Check the pressure gauge',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/checklist-questions/${QUESTION_ID}/edit`]}>
      <Routes>
        <Route
          path="/checklist-questions/:questionId/edit"
          element={<ChecklistQuestionEditPage />}
        />
        <Route
          path="/checklist-questions"
          element={<div data-testid="checklist-question-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChecklistQuestionEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is prefilled with the current text and frequency tags (spec: Edit form is prefilled)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([question]);

    renderPage();

    expect(await screen.findByTestId('checklist-question-edit-text')).toHaveValue(question.text);
    expect(screen.getByTestId('checklist-question-edit-frequency-QUARTERLY')).toBeChecked();
    expect(screen.getByTestId('checklist-question-edit-frequency-MONTHLY')).not.toBeChecked();
  });

  it('renders elementType as read-only text, never an editable control', async () => {
    mockedListChecklistQuestions.mockResolvedValue([question]);

    renderPage();

    const typeDisplay = await screen.findByTestId('checklist-question-edit-type');
    expect(typeDisplay).toHaveTextContent('Fire extinguisher');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a not-found state when the question id is absent from the list', async () => {
    mockedListChecklistQuestions.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('checklist-question-edit-not-found')).toBeInTheDocument();
  });

  it('saves the edit and navigates to the list without a manual reload (spec: Saved edit is visible without a manual reload)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([question]);
    mockedUpdateChecklistQuestion.mockResolvedValue({
      ...question,
      text: 'Updated text',
    });

    renderPage();

    await screen.findByTestId('checklist-question-edit-text');
    fireEvent.change(screen.getByTestId('checklist-question-edit-text'), {
      target: { value: 'Updated text' },
    });
    fireEvent.click(screen.getByTestId('checklist-question-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateChecklistQuestion).toHaveBeenCalledWith(QUESTION_ID, {
        text: 'Updated text',
        frequencies: ['QUARTERLY'],
      }),
    );
    expect(await screen.findByTestId('checklist-question-list-sentinel')).toBeInTheDocument();
  });

  it('requires confirmation before soft-deleting, and the confirm copy does not imply a blocking dependency (spec: Confirmed Soft-Delete)', async () => {
    mockedListChecklistQuestions.mockResolvedValue([question]);

    renderPage();

    fireEvent.click(await screen.findByTestId('checklist-question-edit-delete'));

    expect(mockedSoftDeleteChecklistQuestion).not.toHaveBeenCalled();
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog.textContent).not.toMatch(/template|reference|depend/i);
  });

  it('soft-deletes after confirmation and navigates to the list', async () => {
    mockedListChecklistQuestions.mockResolvedValue([question]);
    mockedSoftDeleteChecklistQuestion.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByTestId('checklist-question-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() =>
      expect(mockedSoftDeleteChecklistQuestion).toHaveBeenCalledWith(QUESTION_ID),
    );
    expect(await screen.findByTestId('checklist-question-list-sentinel')).toBeInTheDocument();
  });

  it('shows the generic not-found message when the server rejects with code: CHECKLIST_QUESTION_NOT_FOUND', async () => {
    mockedListChecklistQuestions.mockResolvedValue([question]);
    mockedUpdateChecklistQuestion.mockRejectedValue(
      new ApiError(404, 'CHECKLIST_QUESTION_NOT_FOUND'),
    );

    renderPage();

    await screen.findByTestId('checklist-question-edit-text');
    fireEvent.click(screen.getByTestId('checklist-question-edit-submit'));

    const error = await screen.findByTestId('checklist-question-edit-error');
    expect(error).toHaveTextContent('This checklist question could not be found.');
  });

  describe('design system', () => {
    it('renders the loading, not-found and error states in empty-state boxes under a page header', async () => {
      mockedListChecklistQuestions.mockReturnValue(new Promise(() => {}));
      const loading = renderPage();
      expect(screen.getByTestId('checklist-question-edit-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedListChecklistQuestions.mockResolvedValue([]);
      const notFound = renderPage();
      expect(await screen.findByTestId('checklist-question-edit-not-found')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      notFound.unmount();

      mockedListChecklistQuestions.mockRejectedValue(new ApiError(0));
      renderPage();
      expect(await screen.findByTestId('checklist-question-edit-error-state')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    // EN-75: the read-only element type is a field group like the editable
    // fields: a bold term above its value, inside an sf-field.
    it('renders the read-only element type as a field group with a bold term', async () => {
      mockedListChecklistQuestions.mockResolvedValue([question]);
      renderPage();

      const type = await screen.findByTestId('checklist-question-edit-type');
      const field = type.parentElement;
      expect(field).toHaveClass('sf-field');
      expect(field?.children).toHaveLength(2);
      expect(field?.firstElementChild).toHaveClass('sf-label');
      expect(field?.firstElementChild).toHaveTextContent(/^Element type$/);
      expect(type).toHaveTextContent(/^Fire extinguisher$/);
    });

    it('renders the form as field groups with choices and the submit as the primary action', async () => {
      mockedListChecklistQuestions.mockResolvedValue([question]);
      renderPage();

      const submit = await screen.findByTestId('checklist-question-edit-submit');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      const text = screen.getByTestId('checklist-question-edit-text');
      expect(text.parentElement).toHaveClass('sf-field');
      expect(text.parentElement?.querySelector(`label[for="${text.id}"]`)).not.toBeNull();
      const checkbox = screen.getByTestId('checklist-question-edit-frequency-QUARTERLY');
      expect(checkbox.parentElement).toHaveClass('sf-choice');
      expect(checkbox.closest('fieldset')).toHaveClass('sf-field');
    });

    // EN-74: the header holds only the title, so the form fields come first
    // in tab order and Delete follows the form's Save in its own group.
    it('puts Delete (danger) after the form, following Save in tab order', async () => {
      mockedListChecklistQuestions.mockResolvedValue([question]);
      renderPage();

      const remove = await screen.findByTestId('checklist-question-edit-delete');
      const submit = screen.getByTestId('checklist-question-edit-submit');
      expect(remove).toHaveClass('sf-btn', 'sf-btn-danger');
      expect(remove.parentElement).toHaveClass('sf-actions');
      expect(remove.closest('.sf-page-header')).toBeNull();
      expect(remove.closest('form')).toBeNull();
      expect(screen.getByRole('heading', { level: 1 }).parentElement?.children).toHaveLength(1);
      expect(
        submit.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('shows the save and delete failures as danger alerts', async () => {
      mockedListChecklistQuestions.mockResolvedValue([question]);
      mockedUpdateChecklistQuestion.mockRejectedValue(new ApiError(400));
      mockedSoftDeleteChecklistQuestion.mockRejectedValue(new ApiError(400));
      renderPage();

      fireEvent.click(await screen.findByTestId('checklist-question-edit-submit'));
      const saveError = await screen.findByTestId('checklist-question-edit-error');
      expect(mockedUpdateChecklistQuestion).toHaveBeenCalled();
      expect(saveError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(saveError).toHaveAttribute('role', 'alert');

      fireEvent.click(screen.getByTestId('checklist-question-edit-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      const deleteError = await screen.findByTestId('checklist-question-edit-delete-error');
      expect(deleteError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(deleteError).toHaveAttribute('role', 'alert');
      expect(deleteError.closest('form')).toBeNull();
      expect(
        screen.getByTestId('checklist-question-edit-submit').compareDocumentPosition(deleteError) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        deleteError.compareDocumentPosition(screen.getByTestId('checklist-question-edit-delete')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
