import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewTemplateApi from '../api/review-template';
import { ReviewTemplateCreatePage } from './ReviewTemplateCreatePage';

vi.mock('../api/review-template');

const mockedCreateDraftReviewTemplate = vi.mocked(reviewTemplateApi.createDraftReviewTemplate);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review-templates/new']}>
      <Routes>
        <Route path="/review-templates/new" element={<ReviewTemplateCreatePage />} />
        <Route path="/review-templates" element={<div data-testid="review-template-list-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_NAME = 'Quarterly extinguisher check';

describe('ReviewTemplateCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the elementType options through the label map, never the raw enum value', () => {
    renderPage();

    const select = screen.getByTestId('review-template-create-type');
    expect(select).toHaveTextContent('Fire extinguisher');
    expect(select).not.toHaveTextContent('EXTINGUISHER');
  });

  it('renders review frequency options through the label map, never the raw enum value', () => {
    renderPage();

    const select = screen.getByTestId('review-template-create-frequency');
    expect(select).toHaveTextContent('Monthly');
    expect(select).not.toHaveTextContent('MONTHLY');
  });

  it('blocks submission client-side and shows a validation error on an empty name', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('review-template-create-submit'));

    expect(await screen.findByTestId('review-template-create-error')).toBeInTheDocument();
    expect(mockedCreateDraftReviewTemplate).not.toHaveBeenCalled();
  });

  it('creates the draft and navigates to the list without a manual reload on valid submission (spec: Valid submission creates the draft)', async () => {
    mockedCreateDraftReviewTemplate.mockResolvedValue({
      id: 'template-1',
      elementType: 'EXTINGUISHER',
      frequency: 'MONTHLY',
      name: VALID_NAME,
      version: null,
      status: 'draft',
    });
    renderPage();

    fireEvent.change(screen.getByTestId('review-template-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.click(screen.getByTestId('review-template-create-submit'));

    await waitFor(() =>
      expect(mockedCreateDraftReviewTemplate).toHaveBeenCalledWith({
        elementType: 'EXTINGUISHER',
        frequency: 'MONTHLY',
        name: VALID_NAME,
      }),
    );
    expect(await screen.findByTestId('review-template-list-sentinel')).toBeInTheDocument();
  });

  it('shows a specific message, not a generic one, on a 409 REVIEW_TEMPLATE_DRAFT_EXISTS rejection (spec: Existing draft conflict is explained, not generic)', async () => {
    mockedCreateDraftReviewTemplate.mockRejectedValue(
      new ApiError(409, 'REVIEW_TEMPLATE_DRAFT_EXISTS'),
    );
    renderPage();

    fireEvent.change(screen.getByTestId('review-template-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.click(screen.getByTestId('review-template-create-submit'));

    const error = await screen.findByTestId('review-template-create-error');
    expect(error).toHaveTextContent(
      'A draft already exists for this element type and review frequency.',
    );
  });
});
