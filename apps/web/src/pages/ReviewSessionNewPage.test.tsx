import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewSessionApi from '../api/review-session';
import { ReviewSessionNewPage } from './ReviewSessionNewPage';

vi.mock('../api/review-session');

const mockedGetReviewScope = vi.mocked(reviewSessionApi.getReviewScope);
const mockedOpenReviewSession = vi.mocked(reviewSessionApi.openReviewSession);

const scope = {
  communities: [{ id: 'c1', name: 'Sunset Towers' }],
  templates: [{ id: 't1', elementType: 'EXTINGUISHER', frequency: 'QUARTERLY', name: 'Q1 checks' }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review-sessions/new']}>
      <Routes>
        <Route path="/review-sessions/new" element={<ReviewSessionNewPage />} />
        <Route path="/review-sessions/:id" element={<div data-testid="detail-page">detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewSessionNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the scope request is in flight', () => {
    mockedGetReviewScope.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-session-new-loading')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the scope request fails', async () => {
    mockedGetReviewScope.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-session-new-error')).toBeInTheDocument();
  });

  it('shows a distinct empty state when the user has no assigned communities', async () => {
    mockedGetReviewScope.mockResolvedValue({ communities: [], templates: scope.templates });

    renderPage();

    expect(await screen.findByTestId('review-session-new-communities-empty')).toBeInTheDocument();
  });

  it('shows a distinct message when no active template exists', async () => {
    mockedGetReviewScope.mockResolvedValue({ communities: scope.communities, templates: [] });

    renderPage();

    expect(await screen.findByTestId('review-session-new-templates-empty')).toBeInTheDocument();
  });

  it('opens a session and navigates to its detail route on success', async () => {
    mockedGetReviewScope.mockResolvedValue(scope);
    mockedOpenReviewSession.mockResolvedValue({
      id: 'session-1',
      communityId: 'c1',
      templateId: 't1',
      performedById: 'u1',
      status: 'draft',
      startedAt: '2026-09-08T00:00:00.000Z',
      completedAt: null,
    });

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-new-submit'));

    await waitFor(() => {
      expect(mockedOpenReviewSession).toHaveBeenCalledWith({ communityId: 'c1', templateId: 't1' });
    });
    expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
  });

  it('shows a mapped error message on a 409 open-draft conflict without navigating', async () => {
    mockedGetReviewScope.mockResolvedValue(scope);
    mockedOpenReviewSession.mockRejectedValue(new ApiError(409, 'OPEN_DRAFT_ALREADY_EXISTS'));

    renderPage();

    fireEvent.click(await screen.findByTestId('review-session-new-submit'));

    expect(await screen.findByTestId('review-session-new-error-message')).toHaveTextContent(
      'You already have an open session for this community and template.',
    );
    expect(screen.queryByTestId('detail-page')).not.toBeInTheDocument();
  });

  describe('design system', () => {
    it('renders the loading, error and empty states in empty-state boxes under a page header', async () => {
      mockedGetReviewScope.mockReturnValue(new Promise(() => {}));
      const loading = renderPage();
      expect(screen.getByTestId('review-session-new-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedGetReviewScope.mockRejectedValue(new ApiError(0));
      const failed = renderPage();
      expect(await screen.findByTestId('review-session-new-error')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      failed.unmount();

      mockedGetReviewScope.mockResolvedValue({ ...scope, communities: [] });
      const noCommunities = renderPage();
      expect(await screen.findByTestId('review-session-new-communities-empty')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      noCommunities.unmount();

      mockedGetReviewScope.mockResolvedValue({ ...scope, templates: [] });
      renderPage();
      expect(await screen.findByTestId('review-session-new-templates-empty')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders the form as field groups under a page header with the submit as the primary action', async () => {
      mockedGetReviewScope.mockResolvedValue(scope);
      renderPage();

      const submit = await screen.findByTestId('review-session-new-submit');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['community', 'template']) {
        const control = screen.getByTestId(`review-session-new-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    it('shows the form error as a danger alert', async () => {
      mockedGetReviewScope.mockResolvedValue(scope);
      mockedOpenReviewSession.mockRejectedValue(new ApiError(409, 'OPEN_DRAFT_ALREADY_EXISTS'));
      renderPage();

      fireEvent.click(await screen.findByTestId('review-session-new-submit'));

      const error = await screen.findByTestId('review-session-new-error-message');
      expect(mockedOpenReviewSession).toHaveBeenCalled();
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });
});
