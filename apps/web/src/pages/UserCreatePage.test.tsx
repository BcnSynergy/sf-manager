import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as usersApi from '../api/users';
import { UserCreatePage } from './UserCreatePage';

vi.mock('../api/users');

const mockedCreateUser = vi.mocked(usersApi.createUser);

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
    mockedCreateUser.mockResolvedValue({ id: 'user-3', email: VALID_EMAIL, role: 'SYSTEM_ADMIN' });
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
});
