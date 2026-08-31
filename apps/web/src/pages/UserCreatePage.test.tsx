import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import * as usersApi from '../api/users';
import { UserCreatePage } from './UserCreatePage';

vi.mock('../api/users');
vi.mock('../api/maintenance-company');

const mockedCreateUser = vi.mocked(usersApi.createUser);
const mockedListMaintenanceCompanies = vi.mocked(maintenanceCompanyApi.listMaintenanceCompanies);

const COMPANIES = [
  { id: 'company-1', name: 'Acme Maintenance', taxId: 'A1', contactInfo: 'x' },
  { id: 'company-2', name: 'Beta Repairs', taxId: 'B2', contactInfo: 'y' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/new']}>
      <Routes>
        <Route path="/users/new" element={<UserCreatePage />} />
        <Route path="/users" element={<div data-testid="users-list-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_EMAIL = 'new.user@sf-manager.example';
const VALID_PASSWORD = 'correct-horse-1';

describe('UserCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListMaintenanceCompanies.mockResolvedValue(COMPANIES);
  });

  it('blocks submission client-side and shows a validation error when the password is weak', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toBeInTheDocument();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it('navigates to the users list without a manual reload on a valid submission', async () => {
    mockedCreateUser.mockResolvedValue({
      id: 'user-3',
      email: VALID_EMAIL,
      role: 'SYSTEM_ADMIN',
      maintenanceCompanyId: null,
    });
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    await waitFor(() => expect(mockedCreateUser).toHaveBeenCalledWith({
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
      role: 'SYSTEM_ADMIN',
    }));
    expect(await screen.findByTestId('users-list-sentinel')).toBeInTheDocument();
  });

  it('shows a specific duplicate-email message (not a generic conflict message) on a 409 EMAIL_ALREADY_IN_USE response', async () => {
    mockedCreateUser.mockRejectedValue(new ApiError(409, 'EMAIL_ALREADY_IN_USE'));
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toHaveTextContent(
      'This email is already in use by another user.',
    );
    expect(screen.queryByTestId('users-list-sentinel')).not.toBeInTheDocument();
  });

  it('does not show the company selector for the default (non-maintenance) role', () => {
    renderPage();

    expect(screen.queryByTestId('user-create-company')).not.toBeInTheDocument();
  });

  it('shows the company selector, populated from GET /maintenance-companies, when a maintenance role is selected', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });

    const select = await screen.findByTestId('user-create-company');
    expect(select).toBeInTheDocument();
    expect(select).toBeRequired();
    expect(screen.getByText('Acme Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Beta Repairs')).toBeInTheDocument();
  });

  it('hides the company selector again, and omits maintenanceCompanyId from the payload, when the role changes away from maintenance', async () => {
    mockedCreateUser.mockResolvedValue({
      id: 'user-4',
      email: VALID_EMAIL,
      role: 'SYSTEM_ADMIN',
      maintenanceCompanyId: null,
    });
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    fireEvent.change(await screen.findByTestId('user-create-company'), {
      target: { value: 'company-1' },
    });
    fireEvent.change(screen.getByTestId('user-create-role'), { target: { value: 'SYSTEM_ADMIN' } });

    expect(screen.queryByTestId('user-create-company')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    await waitFor(() =>
      expect(mockedCreateUser).toHaveBeenCalledWith({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'SYSTEM_ADMIN',
      }),
    );
  });

  it('submits the selected maintenanceCompanyId when a maintenance role is chosen', async () => {
    mockedCreateUser.mockResolvedValue({
      id: 'user-5',
      email: VALID_EMAIL,
      role: 'MAINTENANCE_TECHNICIAN',
      maintenanceCompanyId: 'company-2',
    });
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    fireEvent.change(await screen.findByTestId('user-create-company'), {
      target: { value: 'company-2' },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    await waitFor(() =>
      expect(mockedCreateUser).toHaveBeenCalledWith({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-2',
      }),
    );
  });

  it('blocks submission client-side when a maintenance role is selected but no company is chosen', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    await screen.findByTestId('user-create-company');
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toBeInTheDocument();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it('shows a distinct message for a 400 MAINTENANCE_COMPANY_NOT_FOUND response', async () => {
    mockedCreateUser.mockRejectedValue(new ApiError(400, 'MAINTENANCE_COMPANY_NOT_FOUND'));
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    fireEvent.change(await screen.findByTestId('user-create-company'), {
      target: { value: 'company-1' },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toHaveTextContent(
      'The selected maintenance company no longer exists.',
    );
  });
});
