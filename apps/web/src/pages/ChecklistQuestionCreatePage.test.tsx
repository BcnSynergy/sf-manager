import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as checklistQuestionApi from '../api/checklist-question';
import { ChecklistQuestionCreatePage } from './ChecklistQuestionCreatePage';

vi.mock('../api/checklist-question');

const mockedCreateChecklistQuestion = vi.mocked(checklistQuestionApi.createChecklistQuestion);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/checklist-questions/new']}>
      <Routes>
        <Route path="/checklist-questions/new" element={<ChecklistQuestionCreatePage />} />
        <Route
          path="/checklist-questions"
          element={<div data-testid="checklist-question-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_TEXT = 'Check the pressure gauge';

describe('ChecklistQuestionCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the elementType options through the label map, never the raw enum value', () => {
    renderPage();

    const select = screen.getByTestId('checklist-question-create-type');
    expect(select).toHaveTextContent('Fire extinguisher');
    expect(select).not.toHaveTextContent('EXTINGUISHER');
  });

  it('renders review frequencies through the label map, never the raw enum value', () => {
    renderPage();

    expect(screen.getByText('Quarterly')).toBeInTheDocument();
    expect(screen.queryByText('QUARTERLY')).not.toBeInTheDocument();
  });

  it('blocks submission client-side and shows a validation error when no frequency is selected (spec: Empty frequency selection rejected before any network call)', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('checklist-question-create-text'), {
      target: { value: VALID_TEXT },
    });
    fireEvent.click(screen.getByTestId('checklist-question-create-submit'));

    expect(await screen.findByTestId('checklist-question-create-error')).toBeInTheDocument();
    expect(mockedCreateChecklistQuestion).not.toHaveBeenCalled();
  });

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the validation error again when the same invalid form is submitted again', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('checklist-question-create-text'), {
      target: { value: VALID_TEXT },
    });
    fireEvent.click(screen.getByTestId('checklist-question-create-submit'));

    const first = await screen.findByTestId('checklist-question-create-error');
    fireEvent.click(screen.getByTestId('checklist-question-create-submit'));

    const second = screen.getByTestId('checklist-question-create-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
  });

  it('creates the question and navigates to the list without a manual reload on valid submission (spec: Valid submission creates and lists the question)', async () => {
    mockedCreateChecklistQuestion.mockResolvedValue({
      id: 'question-1',
      elementType: 'EXTINGUISHER',
      frequencies: ['QUARTERLY'],
      text: VALID_TEXT,
    });
    renderPage();

    fireEvent.change(screen.getByTestId('checklist-question-create-text'), {
      target: { value: VALID_TEXT },
    });
    fireEvent.click(screen.getByTestId('checklist-question-create-frequency-QUARTERLY'));
    fireEvent.click(screen.getByTestId('checklist-question-create-submit'));

    await waitFor(() =>
      expect(mockedCreateChecklistQuestion).toHaveBeenCalledWith({
        elementType: 'EXTINGUISHER',
        frequencies: ['QUARTERLY'],
        text: VALID_TEXT,
      }),
    );
    expect(await screen.findByTestId('checklist-question-list-sentinel')).toBeInTheDocument();
  });

  it('shows a mapped error message (not English server prose) on a server-side failure', async () => {
    mockedCreateChecklistQuestion.mockRejectedValue(new ApiError(0));
    renderPage();

    fireEvent.change(screen.getByTestId('checklist-question-create-text'), {
      target: { value: VALID_TEXT },
    });
    fireEvent.click(screen.getByTestId('checklist-question-create-frequency-QUARTERLY'));
    fireEvent.click(screen.getByTestId('checklist-question-create-submit'));

    expect(await screen.findByTestId('checklist-question-create-error')).toBeInTheDocument();
  });

  describe('design system', () => {
    it('renders the title in a page header and the form as field groups with the submit as the primary action', () => {
      renderPage();

      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      const submit = screen.getByTestId('checklist-question-create-submit');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['type', 'text']) {
        const control = screen.getByTestId(`checklist-question-create-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    it('renders each frequency checkbox as a choice inside the frequencies field group', () => {
      renderPage();

      const checkbox = screen.getByTestId('checklist-question-create-frequency-QUARTERLY');
      expect(checkbox.parentElement).toHaveClass('sf-choice');
      expect(checkbox.closest('fieldset')).toHaveClass('sf-field');
    });

    it('shows the form error as a danger alert', async () => {
      renderPage();

      fireEvent.click(screen.getByTestId('checklist-question-create-submit'));

      const error = await screen.findByTestId('checklist-question-create-error');
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });
});
