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
    expect(screen.queryByTestId('maintenance-companies-list-sentinel')).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('maintenance-companies-list-sentinel')).not.toBeInTheDocument();
  });

  describe('design system', () => {
    it('renders the loading, not-found and error states in empty-state boxes under a page header', async () => {
      mockedListMaintenanceCompanies.mockReturnValue(new Promise(() => {}));
      const loading = renderPage(companyA.id);
      expect(screen.getByTestId('maintenance-company-edit-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedListMaintenanceCompanies.mockResolvedValue([companyA]);
      const notFound = renderPage('company-missing');
      expect(await screen.findByTestId('maintenance-company-edit-not-found')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      notFound.unmount();

      mockedListMaintenanceCompanies.mockRejectedValue(new ApiError(0));
      renderPage(companyA.id);
      expect(await screen.findByTestId('maintenance-company-edit-error-state')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders the form as field groups with the submit as the primary action', async () => {
      mockedListMaintenanceCompanies.mockResolvedValue([companyA]);
      renderPage(companyA.id);

      const submit = await screen.findByTestId('maintenance-company-edit-submit');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['name', 'tax-id', 'contact-info']) {
        const control = screen.getByTestId(`maintenance-company-edit-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    // EN-74: the header holds only the title, so the form fields come first
    // in tab order and Delete follows the form's Save in its own group.
    it('puts Delete (danger) after the form, following Save in tab order', async () => {
      mockedListMaintenanceCompanies.mockResolvedValue([companyA]);
      renderPage(companyA.id);

      const remove = await screen.findByTestId('maintenance-company-edit-delete');
      const submit = screen.getByTestId('maintenance-company-edit-submit');
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
      mockedListMaintenanceCompanies.mockResolvedValue([companyA]);
      mockedUpdateMaintenanceCompany.mockRejectedValue(new ApiError(400));
      mockedSoftDeleteMaintenanceCompany.mockRejectedValue(new ApiError(400));
      renderPage(companyA.id);

      fireEvent.click(await screen.findByTestId('maintenance-company-edit-submit'));
      const saveError = await screen.findByTestId('maintenance-company-edit-error');
      expect(mockedUpdateMaintenanceCompany).toHaveBeenCalled();
      expect(saveError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(saveError).toHaveAttribute('role', 'alert');

      fireEvent.click(screen.getByTestId('maintenance-company-edit-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      const deleteError = await screen.findByTestId('maintenance-company-edit-delete-error');
      expect(deleteError).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(deleteError).toHaveAttribute('role', 'alert');
      expect(deleteError.closest('form')).toBeNull();
      expect(
        screen.getByTestId('maintenance-company-edit-submit').compareDocumentPosition(deleteError) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        deleteError.compareDocumentPosition(screen.getByTestId('maintenance-company-edit-delete')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
