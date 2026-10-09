import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewTemplateApi from '../api/review-template';
import { ReviewTemplatesListPage } from './ReviewTemplatesListPage';

vi.mock('../api/review-template');

const mockedListReviewTemplates = vi.mocked(reviewTemplateApi.listReviewTemplates);

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewTemplatesListPage />
    </MemoryRouter>,
  );
}

const templateOne = {
  id: 'template-1',
  elementType: 'EXTINGUISHER' as const,
  frequency: 'QUARTERLY' as const,
  name: 'Quarterly extinguisher check',
  version: 1,
  status: 'active' as const,
};

describe('ReviewTemplatesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight (spec: distinct loading state)', () => {
    mockedListReviewTemplates.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-template-list-loading')).toBeInTheDocument();
  });

  it('shows a distinct empty state, not a blank screen (spec: Empty state)', async () => {
    mockedListReviewTemplates.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('review-template-list-empty')).toBeInTheDocument();
  });

  it('shows a distinct error state, not blank or loading (spec: Error state on fetch failure)', async () => {
    mockedListReviewTemplates.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-template-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('review-template-list-loading')).not.toBeInTheDocument();
  });

  it('groups templates by elementType + frequency and shows name/version/status (spec: Admin views templates across lineages)', async () => {
    mockedListReviewTemplates.mockResolvedValue([templateOne]);

    renderPage();

    const group = await screen.findByTestId('review-template-group-EXTINGUISHER::QUARTERLY');
    expect(group).toHaveTextContent('Fire extinguisher');
    expect(group).toHaveTextContent('Quarterly');
    expect(group).not.toHaveTextContent('EXTINGUISHER');

    const row = await screen.findByTestId(`review-template-list-row-${templateOne.id}`);
    expect(row).toHaveTextContent('Quarterly extinguisher check');
    const status = screen.getByTestId(`review-template-list-status-${templateOne.id}`);
    expect(status).toHaveTextContent('Active');
    expect(status).not.toHaveTextContent('active');
    const version = screen.getByTestId(`review-template-list-version-${templateOne.id}`);
    expect(version).toHaveTextContent('1');
  });

  it('shows a "New review template" link pointing to /review-templates/new', async () => {
    mockedListReviewTemplates.mockResolvedValue([templateOne]);

    renderPage();

    const link = await screen.findByTestId('review-template-list-create-link');
    expect(link).toHaveAttribute('href', '/review-templates/new');
  });

  it('shows a per-row "View" link pointing to /review-templates/:id', async () => {
    mockedListReviewTemplates.mockResolvedValue([templateOne]);

    renderPage();

    const link = await screen.findByTestId(`review-template-list-view-${templateOne.id}`);
    expect(link).toHaveAttribute('href', `/review-templates/${templateOne.id}`);
  });

  it('names each group table by its group heading and scopes every column header', async () => {
    mockedListReviewTemplates.mockResolvedValue([
      templateOne,
      {
        ...templateOne,
        id: 'template-2',
        frequency: 'ANNUAL' as const,
        name: 'Annual extinguisher check',
      },
    ]);

    renderPage();

    await screen.findByTestId('review-template-group-EXTINGUISHER::QUARTERLY');
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);

    const names = ['Fire extinguisher — Quarterly', 'Fire extinguisher — Annual'];
    const lineages = ['EXTINGUISHER::QUARTERLY', 'EXTINGUISHER::ANNUAL'];
    names.forEach((name, index) => {
      const table = screen.getByRole('table', { name });
      const group = screen.getByTestId(`review-template-group-${lineages[index]}`);
      expect(within(group).getByRole('table', { name })).toBe(table);
      expect(table.querySelector('caption')).toHaveClass('visually-hidden');
      const headers = within(table).getAllByRole('columnheader');
      expect(headers).toHaveLength(4);
      for (const header of headers) {
        expect(header).toHaveAttribute('scope', 'col');
      }
      expect(table.querySelector('[scope="row"]')).toBeNull();
    });
    expect(new Set(tables.map((table) => table.querySelector('caption')?.textContent)).size).toBe(2);
  });
});
