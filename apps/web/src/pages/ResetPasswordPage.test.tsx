import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as passwordResetApi from '../api/password-reset';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('../api/password-reset');

const mockedConfirm = vi.mocked(passwordResetApi.confirmPasswordReset);

function LoginSentinel() {
  const location = useLocation();
  return <div data-testid="login-sentinel">{JSON.stringify(location.state ?? null)}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<LoginSentinel />} />
        <Route path="/forgot-password" element={<div data-testid="forgot-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByTestId('reset-password'), { target: { value: password } });
  fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: confirm } });
  fireEvent.click(screen.getByTestId('reset-submit'));
}

describe('ResetPasswordPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    window.history.replaceState(null, '', '/reset-password#token=abc123');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reads the token from the fragment and removes it from the address bar', () => {
    renderPage();

    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('abc123');
    expect(screen.getByTestId('reset-password')).toBeInTheDocument();
  });

  it('still uses the token after it was removed from the address bar', async () => {
    mockedConfirm.mockResolvedValue(undefined);
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('abc123', 'abcdefghi1'));
  });

  it('ignores a token in the query string', () => {
    window.history.replaceState(null, '', '/reset-password?token=abc123');
    renderPage();

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
  });

  it('shows the invalid-link message with a way to ask for a new one when the token is missing', () => {
    window.history.replaceState(null, '', '/reset-password');
    renderPage();

    expect(screen.getByTestId('reset-invalid-link')).toHaveTextContent(
      'This link is invalid or has expired.',
    );
    expect(screen.getByTestId('reset-request-new')).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByTestId('reset-password')).toBeNull();
  });

  it('states the password rules next to the field', () => {
    renderPage();

    expect(screen.getByTestId('reset-password-rules')).toHaveTextContent(
      'At least 10 characters, with at least one letter and one digit.',
    );
  });

  it('shows the password rule message next to the password field when it is weak', () => {
    renderPage();
    fill('short1', 'short1');

    expect(screen.getByTestId('reset-password-error')).toHaveTextContent(
      'At least 10 characters, with at least one letter and one digit.',
    );
    expect(screen.getByTestId('reset-password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('reset-confirm-error')).toBeNull();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('shows its own message next to the confirmation field when the passwords differ', () => {
    renderPage();
    fill('abcdefghi1', 'abcdefghi2');

    expect(screen.getByTestId('reset-confirm-error')).toHaveTextContent(
      'The passwords do not match.',
    );
    expect(screen.queryByTestId('reset-password-error')).toBeNull();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('goes to the login page with a success notice flag on 204', async () => {
    mockedConfirm.mockResolvedValue(undefined);
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    const sentinel = await screen.findByTestId('login-sentinel');
    expect(sentinel).toHaveTextContent('"passwordReset":true');
  });

  it('shows the invalid-link message on 400 INVALID_RESET_TOKEN', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(400, 'INVALID_RESET_TOKEN'));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.getByTestId('reset-request-new')).toHaveAttribute('href', '/forgot-password');
  });

  it('shows the password rule message on a 400 without the invalid-token code', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(400));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      'At least 10 characters, with at least one letter and one digit.',
    );
    expect(screen.queryByTestId('reset-invalid-link')).toBeNull();
  });

  it('shows a rate-limit message on 429', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(429));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      'Too many requests. Please try again later.',
    );
  });

  it('shows a generic error on a network failure', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(0));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
