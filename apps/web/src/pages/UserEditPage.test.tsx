import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as usersApi from '../api/users';
import { useAuth } from '../auth/AuthProvider';
import { UserEditPage } from './UserEditPage';

vi.mock('../api/users');
vi.mock('../auth/AuthProvider', async () => {
  const actual = await vi.importActual<typeof import('../auth/AuthProvider')>('../auth/AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedListUsers = vi.mocked(usersApi.listUsers);
const mockedUpdateUser = vi.mocked(usersApi.updateUser);

const admin = { id: 'admin-1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' as const };
const otherUser = { id: 'user-2', email: 'user2@sf-manager.example', role: 'MANAGER' as const };

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
});
