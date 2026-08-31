import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import { MaintenanceCompanyEditPage } from './MaintenanceCompanyEditPage';

vi.mock('../api/maintenance-company');

const mockedListMaintenanceCompanies = vi.mocked(maintenanceCompanyApi.listMaintenanceCompanies);
const mockedUpdateMaintenanceCompany = vi.mocked(maintenanceCompanyApi.updateMaintenanceCompany);
const mockedSoftDeleteMaintenanceCompany = vi.mocked(
  maintenanceCompanyApi.softDeleteMaintenanceCompany,
);

const companyA = {
  id: 'company-1',
  name: 'Fix-It Corp',
  taxId: 'B12345678',
  contactInfo: 'ops@fixit.example',
};
const companyB = {
  id: 'company-2',
  name: 'Repair Co',
  taxId: 'B87654321',
  contactInfo: 'ops@repairco.example',
};

function renderPage(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/maintenance-companies/${id}/edit`]}>
      <Routes>
        <Route path="/maintenance-companies/:id/edit" element={<MaintenanceCompanyEditPage />} />
        <Route
          path="/maintenance-companies"
          element={<div data-testid="maintenance-companies-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaintenanceCompanyEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListMaintenanceCompanies.mockReturnValue(new Promise(() => {}));

    renderPage(companyA.id);

    expect(screen.getByTestId('maintenance-company-edit-loading')).toBeInTheDocument();
  });

  it('prefills name, taxId, and contactInfo from the fetched list', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA, companyB]);

    renderPage(companyB.id);

    expect(await screen.findByTestId('maintenance-company-edit-name')).toHaveValue(companyB.name);
    expect(screen.getByTestId('maintenance-company-edit-tax-id')).toHaveValue(companyB.taxId);
    expect(screen.getByTestId('maintenance-company-edit-contact-info')).toHaveValue(
      companyB.contactInfo,
    );
  });

  it('shows a not-found state when :id is absent from the list, and renders no form', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA, companyB]);

    renderPage('company-missing');

    expect(await screen.findByTestId('maintenance-company-edit-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-company-edit-name')).not.toBeInTheDocument();
  });

  it('shows a network-error state, not not-found, when listMaintenanceCompanies() itself rejects', async () => {
    mockedListMaintenanceCompanies.mockRejectedValue(new ApiError(0));

    renderPage(companyA.id);

    expect(await screen.findByTestId('maintenance-company-edit-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-company-edit-not-found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-company-edit-name')).not.toBeInTheDocument();
  });

  it('saves changes and navigates to the maintenance companies list without a manual reload', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA, companyB]);
    mockedUpdateMaintenanceCompany.mockResolvedValue({ ...companyB, name: 'Repair Co Updated' });

    renderPage(companyB.id);

    fireEvent.change(await screen.findByTestId('maintenance-company-edit-name'), {
      target: { value: 'Repair Co Updated' },
    });
    fireEvent.click(screen.getByTestId('maintenance-company-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateMaintenanceCompany).toHaveBeenCalledWith(companyB.id, {
        name: 'Repair Co Updated',
        taxId: companyB.taxId,
        contactInfo: companyB.contactInfo,
      }),
    );
    expect(await screen.findByTestId('maintenance-companies-list-sentinel')).toBeInTheDocument();
  });

  it('blocks submission client-side and shows a validation error for a blank name', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA, companyB]);

    renderPage(companyB.id);

    fireEvent.change(await screen.findByTestId('maintenance-company-edit-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('maintenance-company-edit-submit'));

    expect(await screen.findByTestId('maintenance-company-edit-error')).toBeInTheDocument();
    expect(mockedUpdateMaintenanceCompany).not.toHaveBeenCalled();
  });

  it('shows the duplicate-taxId message when the update is rejected with code: TAX_ID_ALREADY_IN_USE', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA, companyB]);
    mockedUpdateMaintenanceCompany.mockRejectedValue(new ApiError(409, 'TAX_ID_ALREADY_IN_USE'));

    renderPage(companyB.id);

    fireEvent.click(await screen.findByTestId('maintenance-company-edit-submit'));

    const error = await screen.findByTestId('maintenance-company-edit-error');
    expect(error).toHaveTextContent(
      'This tax ID is already in use by another active maintenance company.',
    );
    expect(
      screen.queryByTestId('maintenance-companies-list-sentinel'),
    ).not.toBeInTheDocument();
  });

  it('requires confirmation before calling softDeleteMaintenanceCompany', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage(companyA.id);

    fireEvent.click(await screen.findByTestId('maintenance-company-edit-delete'));

    expect(mockedSoftDeleteMaintenanceCompany).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);

    renderPage(companyA.id);

    fireEvent.click(await screen.findByTestId('maintenance-company-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedSoftDeleteMaintenanceCompany).not.toHaveBeenCalled();
    expect(screen.queryByTestId('maintenance-companies-list-sentinel')).not.toBeInTheDocument();
  });

  it('soft-deletes after confirmation and navigates to the list without a manual reload', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);
    mockedSoftDeleteMaintenanceCompany.mockResolvedValue(undefined);

    renderPage(companyA.id);

    fireEvent.click(await screen.findByTestId('maintenance-company-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() =>
      expect(mockedSoftDeleteMaintenanceCompany).toHaveBeenCalledWith(companyA.id),
    );
    expect(await screen.findByTestId('maintenance-companies-list-sentinel')).toBeInTheDocument();
  });

  it('shows a delete-blocked message, distinct from the duplicate-taxId message, on code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS', async () => {
    mockedListMaintenanceCompanies.mockResolvedValue([companyA]);
    mockedSoftDeleteMaintenanceCompany.mockRejectedValue(
      new ApiError(409, 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS'),
    );

    renderPage(companyA.id);

    fireEvent.click(await screen.findByTestId('maintenance-company-edit-delete'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    const error = await screen.findByTestId('maintenance-company-edit-delete-error');
    expect(error).toHaveTextContent(
      'This maintenance company still has active users. Reassign or remove them first.',
    );
    expect(error).not.toHaveTextContent(
      'This tax ID is already in use by another active maintenance company.',
    );
    expect(
      screen.queryByTestId('maintenance-companies-list-sentinel'),
    ).not.toBeInTheDocument();
  });
});
