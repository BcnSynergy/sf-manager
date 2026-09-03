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
    expect(
      await screen.findByTestId('checklist-question-list-sentinel'),
    ).toBeInTheDocument();
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
});
