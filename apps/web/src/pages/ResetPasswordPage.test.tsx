import { StrictMode } from 'react';
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

  it('keeps the token under StrictMode, which runs state initializers twice', async () => {
    // The app renders inside <StrictMode> (main.tsx); a token read and
    // stripped in one step was lost on the second call.
    mockedConfirm.mockResolvedValue(undefined);
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/reset-password']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(screen.getByTestId('reset-password')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    fill('abcdefghi1', 'abcdefghi1');
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('abc123', 'abcdefghi1'));
  });

  it('keeps the token when the page mounts again after removing it from the address bar', async () => {
    // A lazy route can mount the page once more (Suspense), after the first
    // mount already stripped the fragment.
    mockedConfirm.mockResolvedValue(undefined);
    renderPage().unmount();
    expect(window.location.hash).toBe('');

    renderPage();
    expect(screen.getByTestId('reset-password')).toBeInTheDocument();
    fill('abcdefghi1', 'abcdefghi1');
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('abc123', 'abcdefghi1'));
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

  it('shows both fields own messages when the password is weak and the confirmation differs', () => {
    renderPage();
    fill('short1', 'different1');

    expect(screen.getByTestId('reset-password-error')).toBeInTheDocument();
    expect(screen.getByTestId('reset-confirm-error')).toHaveTextContent(
      'The passwords do not match.',
    );
    // The error stands in for the rules hint instead of repeating it.
    expect(screen.queryByTestId('reset-password-rules')).toBeNull();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('goes to the login page with a success notice flag on 204', async () => {
    mockedConfirm.mockResolvedValue(undefined);
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    const sentinel = await screen.findByTestId('login-sentinel');
    expect(sentinel).toHaveTextContent('"passwordReset":true');
    // Spent: the token no longer lingers in the history entry either.
    expect(JSON.stringify(window.history.state ?? {})).not.toContain('abc123');
  });

  it('shows the invalid-link message on 400 INVALID_RESET_TOKEN', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(400, 'INVALID_RESET_TOKEN'));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.getByTestId('reset-request-new')).toHaveAttribute('href', '/forgot-password');
    expect(JSON.stringify(window.history.state ?? {})).not.toContain('abc123');
  });

  it('shows the password rule message on a 400 without the invalid-token code', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(400));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      'At least 10 characters, with at least one letter and one digit.',
    );
    expect(screen.queryByTestId('reset-invalid-link')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('reset-submit')).toBeEnabled());
  });

  it('points each field at its own message for assistive technology', () => {
    renderPage();
    expect(screen.getByTestId('reset-password')).toHaveAttribute(
      'aria-describedby',
      'reset-password-rules',
    );

    fill('short1', 'different1');

    expect(screen.getByTestId('reset-password')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('reset-password-error').id,
    );
    expect(screen.getByTestId('reset-password-confirm')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('reset-confirm-error').id,
    );
  });

  it('shows a rate-limit message on 429', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(429));
    renderPage();
    fill('abcdefghi1', 'abcdefghi1');

    expect(await screen.findByTestId('reset-error')).toHaveTextContent(
      'Too many requests. Please try again later.',
    );
    // The user can try again.
    await waitFor(() => expect(screen.getByTestId('reset-submit')).toBeEnabled());
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
