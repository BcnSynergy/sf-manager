import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { AuthProvider } from '../auth/AuthProvider';
import { LoginPage } from './LoginPage';

function mockFetch(loginResponse: Partial<Response>) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve({ ok: false } as Response);
    }
    if (href.includes('/auth/login')) {
      return Promise.resolve(loginResponse as Response);
    }
    return Promise.reject(new Error(`unexpected fetch to ${href}`));
  });
}

function renderLoginPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ ok: true, json: async () => ({ id: '1', email: 'admin@sf-manager.example' }) }));
  });

  it('renders the app logo', () => {
    renderLoginPage();

    expect(screen.getByTestId('login-logo')).toBeInTheDocument();
  });

  it('blocks submission client-side and shows a required-field message when fields are empty', async () => {
    renderLoginPage();

    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Email and password are required.',
    );

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/login'))).toBe(false);
  });

  it('shows an invalid-email message (not the required-field one) when both fields are filled but the email format is wrong', async () => {
    renderLoginPage();

    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'some-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Enter a valid email address.',
    );

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/login'))).toBe(false);
  });

  it('shows one generic error message on invalid credentials, never field-specific', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ ok: false, status: 401 } as Response),
    );
    renderLoginPage();

    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'admin@sf-manager.example' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Invalid email or password.',
    );
  });
});
