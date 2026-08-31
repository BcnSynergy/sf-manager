import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import * as usersApi from '../api/users';
import { useAuth } from '../auth/AuthProvider';
import { UserEditPage } from './UserEditPage';

vi.mock('../api/users');
vi.mock('../api/maintenance-company');
vi.mock('../auth/AuthProvider', async () => {
  const actual = await vi.importActual<typeof import('../auth/AuthProvider')>('../auth/AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedListUsers = vi.mocked(usersApi.listUsers);
const mockedUpdateUser = vi.mocked(usersApi.updateUser);
const mockedListMaintenanceCompanies = vi.mocked(maintenanceCompanyApi.listMaintenanceCompanies);

const COMPANIES = [
  { id: 'company-1', name: 'Acme Maintenance', taxId: 'A1', contactInfo: 'x' },
  { id: 'company-2', name: 'Beta Repairs', taxId: 'B2', contactInfo: 'y' },
];

const admin = {
  id: 'admin-1',
  email: 'admin@sf-manager.example',
  role: 'SYSTEM_ADMIN' as const,
  maintenanceCompanyId: null,
};
const otherUser = {
  id: 'user-2',
  email: 'user2@sf-manager.example',
  role: 'MANAGER' as const,
  maintenanceCompanyId: null,
};
const technician = {
  id: 'user-3',
  email: 'tech@sf-manager.example',
  role: 'MAINTENANCE_TECHNICIAN' as const,
  maintenanceCompanyId: 'company-1',
};

function renderPage(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/users/${id}/edit`]}>
      <Routes>
        <Route path="/users/:id/edit" element={<UserEditPage />} />
        <Route path="/users" element={<div data-testid="users-list-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UserEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: admin,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedListMaintenanceCompanies.mockResolvedValue(COMPANIES);
  });

  it("prefills email and role from the list, and does not present a password field, when editing another user's row", async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    renderPage(otherUser.id);

    expect(await screen.findByTestId('user-edit-email')).toHaveValue(otherUser.email);
    expect(screen.getByTestId('user-edit-role')).toHaveValue(otherUser.role);
    expect(screen.queryByTestId('user-edit-password')).not.toBeInTheDocument();
  });

  it("disables the role field when editing the admin's own row", async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    renderPage(admin.id);

    expect(await screen.findByTestId('user-edit-role')).toBeDisabled();
  });

  it("leaves the role field enabled when editing another user's row", async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    renderPage(otherUser.id);

    expect(await screen.findByTestId('user-edit-role')).not.toBeDisabled();
  });

  it('shows a not-found state when :id is absent from the list', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    renderPage('user-missing');

    expect(await screen.findByTestId('user-edit-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('user-edit-email')).not.toBeInTheDocument();
  });

  it('shows a network-error state, not not-found, when listUsers() itself rejects', async () => {
    mockedListUsers.mockRejectedValue(new ApiError(0));
    renderPage(otherUser.id);

    expect(await screen.findByTestId('user-edit-error-state')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.queryByTestId('user-edit-not-found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-edit-email')).not.toBeInTheDocument();
  });

  it('saves changes and navigates to the users list without a manual reload', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    mockedUpdateUser.mockResolvedValue({ ...otherUser, email: 'updated@sf-manager.example' });
    renderPage(otherUser.id);

    fireEvent.change(await screen.findByTestId('user-edit-email'), {
      target: { value: 'updated@sf-manager.example' },
    });
    fireEvent.click(screen.getByTestId('user-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateUser).toHaveBeenCalledWith(otherUser.id, {
        email: 'updated@sf-manager.example',
        role: otherUser.role,
      }),
    );
    expect(await screen.findByTestId('users-list-sentinel')).toBeInTheDocument();
  });

  it('blocks submission client-side and shows a validation error for an invalid email', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    renderPage(otherUser.id);

    fireEvent.change(await screen.findByTestId('user-edit-email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByTestId('user-edit-submit'));

    expect(await screen.findByTestId('user-edit-error')).toBeInTheDocument();
    expect(mockedUpdateUser).not.toHaveBeenCalled();
  });

  it('shows a distinct last-admin-lockout message on a 409 LAST_SYSTEM_ADMIN response', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    mockedUpdateUser.mockRejectedValue(new ApiError(409, 'LAST_SYSTEM_ADMIN'));
    renderPage(otherUser.id);

    fireEvent.click(await screen.findByTestId('user-edit-submit'));

    expect(await screen.findByTestId('user-edit-error')).toHaveTextContent(
      'The last system administrator cannot be removed.',
    );
    expect(screen.queryByTestId('users-list-sentinel')).not.toBeInTheDocument();
  });

  it('shows a distinct concurrency-conflict message on a 409 TRANSACTION_CONFLICT response, without retrying', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    mockedUpdateUser.mockRejectedValue(new ApiError(409, 'TRANSACTION_CONFLICT'));
    renderPage(otherUser.id);

    fireEvent.click(await screen.findByTestId('user-edit-submit'));

    expect(await screen.findByTestId('user-edit-error')).toHaveTextContent(
      'Something changed while saving. Please try again.',
    );
    expect(mockedUpdateUser).toHaveBeenCalledTimes(1);
  });

  it('does not show the company selector when the row being edited has a non-maintenance role', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    renderPage(otherUser.id);

    await screen.findByTestId('user-edit-email');
    expect(screen.queryByTestId('user-edit-company')).not.toBeInTheDocument();
  });

  it('shows the company selector preselected to the current company for a maintenance-role user', async () => {
    mockedListUsers.mockResolvedValue([admin, technician]);
    renderPage(technician.id);

    const select = await screen.findByTestId('user-edit-company');
    expect(select).toBeRequired();
    expect(select).toHaveValue(technician.maintenanceCompanyId);
    expect(screen.getByText('Acme Maintenance')).toBeInTheDocument();
  });

  it('hides the company selector, and omits maintenanceCompanyId from the payload, when the role is changed away from maintenance', async () => {
    mockedListUsers.mockResolvedValue([admin, technician]);
    mockedUpdateUser.mockResolvedValue({ ...technician, role: 'MANAGER', maintenanceCompanyId: null });
    renderPage(technician.id);

    await screen.findByTestId('user-edit-company');
    fireEvent.change(screen.getByTestId('user-edit-role'), { target: { value: 'MANAGER' } });

    expect(screen.queryByTestId('user-edit-company')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('user-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateUser).toHaveBeenCalledWith(technician.id, {
        email: technician.email,
        role: 'MANAGER',
      }),
    );
  });

  it('submits the selected maintenanceCompanyId for a maintenance-role user', async () => {
    mockedListUsers.mockResolvedValue([admin, technician]);
    mockedUpdateUser.mockResolvedValue({ ...technician, maintenanceCompanyId: 'company-2' });
    renderPage(technician.id);

    fireEvent.change(await screen.findByTestId('user-edit-company'), {
      target: { value: 'company-2' },
    });
    fireEvent.click(screen.getByTestId('user-edit-submit'));

    await waitFor(() =>
      expect(mockedUpdateUser).toHaveBeenCalledWith(technician.id, {
        email: technician.email,
        role: technician.role,
        maintenanceCompanyId: 'company-2',
      }),
    );
  });

  it('shows a distinct message for a 400 MAINTENANCE_COMPANY_REQUIRED response', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    mockedUpdateUser.mockRejectedValue(new ApiError(400, 'MAINTENANCE_COMPANY_REQUIRED'));
    renderPage(otherUser.id);

    fireEvent.click(await screen.findByTestId('user-edit-submit'));

    expect(await screen.findByTestId('user-edit-error')).toHaveTextContent(
      'This role requires selecting a maintenance company.',
    );
  });

  it('shows a distinct message for a 400 MAINTENANCE_COMPANY_NOT_ALLOWED response', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    mockedUpdateUser.mockRejectedValue(new ApiError(400, 'MAINTENANCE_COMPANY_NOT_ALLOWED'));
    renderPage(otherUser.id);

    fireEvent.click(await screen.findByTestId('user-edit-submit'));

    expect(await screen.findByTestId('user-edit-error')).toHaveTextContent(
      'This role does not accept a maintenance company.',
    );
  });

  it('shows a distinct message for a 400 MAINTENANCE_COMPANY_NOT_FOUND response', async () => {
    mockedListUsers.mockResolvedValue([admin, technician]);
    mockedUpdateUser.mockRejectedValue(new ApiError(400, 'MAINTENANCE_COMPANY_NOT_FOUND'));
    renderPage(technician.id);

    fireEvent.click(await screen.findByTestId('user-edit-submit'));

    expect(await screen.findByTestId('user-edit-error')).toHaveTextContent(
      'The selected maintenance company no longer exists.',
    );
  });
});
