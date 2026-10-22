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
        <Route
          path="/review-templates"
          element={<div data-testid="review-template-list-sentinel" />}
        />
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

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the validation error again when the same invalid form is submitted again', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('review-template-create-submit'));

    const first = await screen.findByTestId('review-template-create-error');
    fireEvent.click(screen.getByTestId('review-template-create-submit'));

    const second = screen.getByTestId('review-template-create-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
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

  describe('design system', () => {
    it('renders the title in a page header and the form as field groups with the submit as the primary action', () => {
      renderPage();

      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      const submit = screen.getByTestId('review-template-create-submit');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['type', 'frequency', 'name']) {
        const control = screen.getByTestId(`review-template-create-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    it('shows the form error as a danger alert', async () => {
      renderPage();

      fireEvent.click(screen.getByTestId('review-template-create-submit'));

      const error = await screen.findByTestId('review-template-create-error');
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });
});
