import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import { MaintenanceCompanyCreatePage } from './MaintenanceCompanyCreatePage';

vi.mock('../api/maintenance-company');

const mockedCreateMaintenanceCompany = vi.mocked(
  maintenanceCompanyApi.createMaintenanceCompany,
);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/maintenance-companies/new']}>
      <Routes>
        <Route path="/maintenance-companies/new" element={<MaintenanceCompanyCreatePage />} />
        <Route
          path="/maintenance-companies"
          element={<div data-testid="maintenance-companies-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_NAME = 'Fix-It Corp';
const VALID_TAX_ID = 'B12345678';
const VALID_CONTACT_INFO = 'ops@fixit.example';

describe('MaintenanceCompanyCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submission client-side and shows a validation error when a required field is empty', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('maintenance-company-create-name'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-tax-id'), {
      target: { value: VALID_TAX_ID },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-contact-info'), {
      target: { value: VALID_CONTACT_INFO },
    });
    fireEvent.click(screen.getByTestId('maintenance-company-create-submit'));

    expect(await screen.findByTestId('maintenance-company-create-error')).toBeInTheDocument();
    expect(mockedCreateMaintenanceCompany).not.toHaveBeenCalled();
  });

  it('navigates to the maintenance companies list without a manual reload on a valid submission', async () => {
    mockedCreateMaintenanceCompany.mockResolvedValue({
      id: 'company-1',
      name: VALID_NAME,
      taxId: VALID_TAX_ID,
      contactInfo: VALID_CONTACT_INFO,
    });
    renderPage();

    fireEvent.change(screen.getByTestId('maintenance-company-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-tax-id'), {
      target: { value: VALID_TAX_ID },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-contact-info'), {
      target: { value: VALID_CONTACT_INFO },
    });
    fireEvent.click(screen.getByTestId('maintenance-company-create-submit'));

    await waitFor(() =>
      expect(mockedCreateMaintenanceCompany).toHaveBeenCalledWith({
        name: VALID_NAME,
        taxId: VALID_TAX_ID,
        contactInfo: VALID_CONTACT_INFO,
      }),
    );
    expect(
      await screen.findByTestId('maintenance-companies-list-sentinel'),
    ).toBeInTheDocument();
  });

  it('shows the duplicate-taxId message when the server rejects with code: TAX_ID_ALREADY_IN_USE', async () => {
    mockedCreateMaintenanceCompany.mockRejectedValue(
      new ApiError(409, 'TAX_ID_ALREADY_IN_USE'),
    );
    renderPage();

    fireEvent.change(screen.getByTestId('maintenance-company-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-tax-id'), {
      target: { value: VALID_TAX_ID },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-contact-info'), {
      target: { value: VALID_CONTACT_INFO },
    });
    fireEvent.click(screen.getByTestId('maintenance-company-create-submit'));

    const error = await screen.findByTestId('maintenance-company-create-error');
    expect(error).toHaveTextContent(
      'This tax ID is already in use by another active maintenance company.',
    );
    expect(
      screen.queryByTestId('maintenance-companies-list-sentinel'),
    ).not.toBeInTheDocument();
  });

  it('shows a mapped error message (not English server prose) for a generic failure', async () => {
    mockedCreateMaintenanceCompany.mockRejectedValue(new ApiError(0));
    renderPage();

    fireEvent.change(screen.getByTestId('maintenance-company-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-tax-id'), {
      target: { value: VALID_TAX_ID },
    });
    fireEvent.change(screen.getByTestId('maintenance-company-create-contact-info'), {
      target: { value: VALID_CONTACT_INFO },
    });
    fireEvent.click(screen.getByTestId('maintenance-company-create-submit'));

    expect(await screen.findByTestId('maintenance-company-create-error')).toBeInTheDocument();
  });
});
