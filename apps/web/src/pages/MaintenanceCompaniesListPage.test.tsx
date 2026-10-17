import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import { MaintenanceCompaniesListPage } from './MaintenanceCompaniesListPage';

vi.mock('../api/maintenance-company');

const mockedListMaintenanceCompanies = vi.mocked(maintenanceCompanyApi.listMaintenanceCompanies);

const companyA = {
  id: 'company-1',
  name: 'Fix-It Corp',
  taxId: 'B12345678',
  contactInfo: 'ops@fixit.example',
};
const companyB = {
  id: 'company-2',
  name: 'Reliable Repairs',
  taxId: 'B87654321',
  contactInfo: 'contact@reliable.example',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MaintenanceCompaniesListPage />
    </MemoryRouter>,
  );
}

describe('MaintenanceCompaniesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListMaintenanceCompanies.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('maintenance-companies-list-loading')).toBeInTheDocument();
  });

  it('shows an empty state when no active companies exist', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('maintenance-companies-list-empty')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the list request fails', async () => {
    mockedListMaintenanceCompanies.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('maintenance-companies-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-companies-list-loading')).not.toBeInTheDocument();
  });

  it('renders each active company row with name, taxId, and contactInfo', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA, companyB]);

    renderPage();

    const row = await screen.findByTestId(`maintenance-companies-list-row-${companyB.id}`);
    expect(row).toHaveTextContent(companyB.name);
    expect(row).toHaveTextContent(companyB.taxId);
    expect(row).toHaveTextContent(companyB.contactInfo);
  });

  it('shows a "New maintenance company" link pointing to /maintenance-companies/new', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage();

    const link = await screen.findByTestId('maintenance-companies-list-create-link');
    expect(link).toHaveAttribute('href', '/maintenance-companies/new');
  });

  it('shows an "Edit" link per row pointing to /maintenance-companies/:id/edit', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage();

    const link = await screen.findByTestId(`maintenance-companies-list-edit-${companyA.id}`);
    expect(link).toHaveAttribute('href', `/maintenance-companies/${companyA.id}/edit`);
  });

  it('names the table by its heading and scopes every column header', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage();

    const table = await screen.findByRole('table', {
      name: i18n.t('maintenanceCompany.list.title'),
    });
    expect(table.querySelector('caption')).toHaveClass('visually-hidden');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    expect(table.querySelector('[scope="row"]')).toBeNull();
  });

  it('puts the heading in a page header and the loading, empty and error messages in empty-state boxes', async () => {
    mockedListMaintenanceCompanies.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderPage();
    expect(screen.getByTestId('maintenance-companies-list-loading')).toHaveClass('sf-empty');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveClass(
      'sf-page-header',
    );
    unmount();

    mockedListMaintenanceCompanies.mockResolvedValueOnce([]);
    const empty = renderPage();
    expect(await screen.findByTestId('maintenance-companies-list-empty')).toHaveClass('sf-empty');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveClass(
      'sf-page-header',
    );
    empty.unmount();

    mockedListMaintenanceCompanies.mockRejectedValueOnce(new ApiError(0));
    renderPage();
    expect(await screen.findByTestId('maintenance-companies-list-error')).toHaveClass('sf-empty');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveClass(
      'sf-page-header',
    );
  });

  it('shows the create link as the primary button in the page header and wraps the table', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage();

    const table = await screen.findByRole('table', {
      name: i18n.t('maintenanceCompany.list.title'),
    });
    expect(table.parentElement).toHaveClass('sf-table-wrap');
    const create = screen.getByTestId('maintenance-companies-list-create-link');
    expect(create).toHaveClass('sf-btn', 'sf-btn-primary');
    expect(create.closest('header')).toHaveClass('sf-page-header');
  });

  it('shows Edit as a secondary button and the tax id as data', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage();

    const edit = await screen.findByTestId(`maintenance-companies-list-edit-${companyA.id}`);
    expect(edit.tagName).toBe('A');
    expect(edit).toHaveClass('sf-btn');
    expect(edit).not.toHaveClass('sf-btn-primary');
    expect(edit.parentElement).toHaveClass('sf-actions');
    expect(
      within(screen.getByTestId(`maintenance-companies-list-row-${companyA.id}`)).getByText(
        companyA.taxId,
      ),
    ).toHaveClass('sf-data');
  });
});
