import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as passwordResetApi from '../api/password-reset';
import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('../api/password-reset');

const mockedRequest = vi.mocked(passwordResetApi.requestPasswordReset);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div data-testid="login-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit(email: string) {
  fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: email } });
  fireEvent.click(screen.getByTestId('forgot-submit'));
}

describe('ForgotPasswordPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the branding like the login page', () => {
    renderPage();
    expect(screen.getByTestId('login-logo')).toHaveAttribute('src', '/logo.svg');
    expect(screen.getByTestId('login-credit')).toHaveTextContent('A BCNSynergy product');
  });

  it('blocks an invalid email client-side without calling the API', async () => {
    renderPage();
    submit('not-an-email');

    expect(await screen.findByTestId('forgot-error')).toHaveTextContent(
      'Enter a valid email address.',
    );
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('sends en when the app language is not one of the email languages', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await i18n.changeLanguage('en-US');
    renderPage();
    submit('user@example.com');

    await screen.findByTestId('forgot-confirmation');
    expect(mockedRequest).toHaveBeenCalledWith('user@example.com', 'en');
  });

  it('posts the normalized email with the current language and shows the confirmation', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await i18n.changeLanguage('ca');
    renderPage();
    submit('  User@Example.COM ');

    const done = await screen.findByTestId('forgot-confirmation');
    expect(done).toHaveTextContent(
      "Si existeix un compte amb aquest correu, hem enviat un enllaç; caduca d'aquí a 30 minuts.",
    );
    expect(mockedRequest).toHaveBeenCalledWith('user@example.com', 'ca');
    expect(screen.queryByTestId('forgot-email')).toBeNull();
    expect(screen.getByTestId('forgot-back-to-login')).toHaveAttribute('href', '/login');
  });

  it.each([
    ['en', 'If an account exists for that email, we have sent a link; it expires in 30 minutes.'],
    ['es', 'Si existe una cuenta con ese correo, hemos enviado un enlace; caduca en 30 minutos.'],
  ])('shows the same confirmation text in %s', async (lng, text) => {
    mockedRequest.mockResolvedValue(undefined);
    await i18n.changeLanguage(lng);
    renderPage();
    submit('a@example.com');

    expect(await screen.findByTestId('forgot-confirmation')).toHaveTextContent(text);
    expect(mockedRequest).toHaveBeenCalledWith('a@example.com', lng);
  });

  it('shows a distinct rate-limit message on 429 and keeps the form usable', async () => {
    mockedRequest.mockRejectedValue(new ApiError(429));
    renderPage();
    submit('a@example.com');

    expect(await screen.findByTestId('forgot-error')).toHaveTextContent(
      'Too many requests. Please try again later.',
    );
    expect(screen.queryByTestId('forgot-confirmation')).toBeNull();
    expect(screen.getByTestId('forgot-email')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('forgot-submit')).toBeEnabled());
  });

  it.each([
    ['a network failure', new ApiError(0)],
    ['a server error', new ApiError(500)],
  ])('shows a generic error on %s', async (_label, error) => {
    mockedRequest.mockRejectedValue(error);
    renderPage();
    submit('a@example.com');

    await waitFor(() =>
      expect(screen.getByTestId('forgot-error')).toHaveTextContent(
        'Something went wrong. Please try again.',
      ),
    );
    expect(screen.queryByTestId('forgot-confirmation')).toBeNull();
  });
});
