import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import * as usersApi from '../api/users';
import { useAuth } from '../auth/AuthProvider';
import { UsersListPage } from './UsersListPage';

vi.mock('../api/users');
vi.mock('../api/maintenance-company');
vi.mock('../auth/AuthProvider', async () => {
  const actual = await vi.importActual<typeof import('../auth/AuthProvider')>('../auth/AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedListUsers = vi.mocked(usersApi.listUsers);
const mockedDeactivateUser = vi.mocked(usersApi.deactivateUser);
const mockedListMaintenanceCompanies = vi.mocked(maintenanceCompanyApi.listMaintenanceCompanies);

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
const orphanedTechnician = {
  id: 'user-4',
  email: 'orphan@sf-manager.example',
  role: 'MAINTENANCE_TECHNICIAN' as const,
  maintenanceCompanyId: 'company-does-not-exist',
};
const grandfatheredTechnician = {
  id: 'user-5',
  email: 'grandfathered@sf-manager.example',
  role: 'MAINTENANCE_TECHNICIAN' as const,
  maintenanceCompanyId: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersListPage />
    </MemoryRouter>,
  );
}

describe('UsersListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: admin,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedListMaintenanceCompanies.mockResolvedValue([]);
  });

  it('shows a loading state while the list request is in flight', () => {
    mockedListUsers.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('users-list-loading')).toBeInTheDocument();
  });

  it('shows an empty state when no active users exist', async () => {
    mockedListUsers.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('users-list-empty')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the list request fails', async () => {
    mockedListUsers.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('users-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('users-list-loading')).not.toBeInTheDocument();
  });

  it('renders each active user row with id, email, and role', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);

    renderPage();

    const row = await screen.findByTestId(`users-list-row-${otherUser.id}`);
    expect(row).toHaveTextContent(otherUser.id);
    expect(row).toHaveTextContent(otherUser.email);
    // otherUser.role is 'MANAGER' — asserts the translated label renders,
    // not the raw enum value (spec "Internationalization Coverage").
    expect(row).toHaveTextContent('Manager');
    expect(row).not.toHaveTextContent(otherUser.role);
  });

  it("renders a maintenance-role user's company name, resolved from the id->name map, never the raw id", async () => {
    mockedListUsers.mockResolvedValue([admin, technician]);
    mockedListMaintenanceCompanies.mockResolvedValue([
      { id: 'company-1', name: 'Acme Maintenance', taxId: 'A1', contactInfo: 'x' },
    ]);

    renderPage();

    const row = await screen.findByTestId(`users-list-row-${technician.id}`);
    expect(row).toHaveTextContent('Acme Maintenance');
    expect(row).not.toHaveTextContent(technician.maintenanceCompanyId);
  });

  it('renders maintenanceCompany.unknown for a maintenance-role user whose companyId does not resolve', async () => {
    mockedListUsers.mockResolvedValue([admin, orphanedTechnician]);
    mockedListMaintenanceCompanies.mockResolvedValue([
      { id: 'company-1', name: 'Acme Maintenance', taxId: 'A1', contactInfo: 'x' },
    ]);

    renderPage();

    const row = await screen.findByTestId(`users-list-row-${orphanedTechnician.id}`);
    expect(row).toHaveTextContent('Unknown maintenance company');
    expect(row).not.toHaveTextContent(orphanedTechnician.maintenanceCompanyId);
  });

  it('renders maintenanceCompany.unknown for a maintenance-role user with no company at all (grandfathered pre-migration row)', async () => {
    mockedListUsers.mockResolvedValue([admin, grandfatheredTechnician]);
    mockedListMaintenanceCompanies.mockResolvedValue([
      { id: 'company-1', name: 'Acme Maintenance', taxId: 'A1', contactInfo: 'x' },
    ]);

    renderPage();

    const row = await screen.findByTestId(`users-list-row-${grandfatheredTechnician.id}`);
    expect(row).toHaveTextContent('Unknown maintenance company');
  });

  it('renders no company text for a non-maintenance-role user', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);

    renderPage();

    const row = await screen.findByTestId(`users-list-row-${otherUser.id}`);
    expect(row).not.toHaveTextContent('Unknown maintenance company');
  });

  it("hides the deactivate action on the current admin's own row, shows it on others", async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);

    renderPage();

    await screen.findByTestId(`users-list-row-${admin.id}`);

    expect(screen.queryByTestId(`users-list-deactivate-${admin.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`users-list-deactivate-${otherUser.id}`)).toBeInTheDocument();
  });

  it('requires confirmation before calling deactivateUser', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);

    renderPage();

    fireEvent.click(await screen.findByTestId(`users-list-deactivate-${otherUser.id}`));

    expect(mockedDeactivateUser).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');
  });

  it('deactivates the user after confirmation and refetches the list', async () => {
    mockedListUsers
      .mockResolvedValueOnce([admin, otherUser])
      .mockResolvedValueOnce([admin]);
    mockedDeactivateUser.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByTestId(`users-list-deactivate-${otherUser.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockedDeactivateUser).toHaveBeenCalledWith(otherUser.id));
    await waitFor(() =>
      expect(screen.queryByTestId(`users-list-row-${otherUser.id}`)).not.toBeInTheDocument(),
    );
    expect(mockedListUsers).toHaveBeenCalledTimes(2);
  });

  it('does not deactivate when the confirmation dialog is cancelled', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);

    renderPage();

    fireEvent.click(await screen.findByTestId(`users-list-deactivate-${otherUser.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedDeactivateUser).not.toHaveBeenCalled();
    expect(screen.getByTestId(`users-list-row-${otherUser.id}`)).toBeInTheDocument();
  });

  it('shows a "New user" link pointing to /users/new', async () => {
    mockedListUsers.mockResolvedValue([admin]);

    renderPage();

    const link = await screen.findByTestId('users-list-create-link');
    expect(link).toHaveAttribute('href', '/users/new');
  });

  it('shows a per-row "Edit" link pointing to /users/:id/edit', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);

    renderPage();

    const link = await screen.findByTestId(`users-list-edit-${otherUser.id}`);
    expect(link).toHaveAttribute('href', `/users/${otherUser.id}/edit`);
  });

  it('shows a cause-specific message (mapped via error-messages, not English server prose) when deactivation fails', async () => {
    mockedListUsers.mockResolvedValue([admin, otherUser]);
    mockedDeactivateUser.mockRejectedValue(new ApiError(409, 'LAST_SYSTEM_ADMIN'));

    renderPage();

    fireEvent.click(await screen.findByTestId(`users-list-deactivate-${otherUser.id}`));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('users-list-action-error')).toHaveTextContent(
      'The last system administrator cannot be removed.',
    );
    expect(screen.getByTestId(`users-list-row-${otherUser.id}`)).toBeInTheDocument();
  });
});
