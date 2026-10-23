import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
import { apiFetch } from '../api/client';
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
    vi.stubGlobal(
      'fetch',
      mockFetch({ ok: true, json: async () => ({ id: '1', email: 'admin@sf-manager.example' }) }),
    );
  });

  // web-visual-foundation spec "The Product Is Branded With Its Own Marks":
  // one <img> with the localized alt, and a dark-ground <source> the browser
  // picks when the OS prefers dark (ui-redesign-foundation design Decision 8).
  it('renders the app logo with a dark-theme variant and its localized alt text', () => {
    renderLoginPage();

    const logo = screen.getByTestId('login-logo');
    expect(logo).toHaveAttribute('src', '/logo.svg');
    expect(logo).toHaveAttribute('alt', 'SF-Manager');
    expect(screen.getAllByRole('img', { name: 'SF-Manager' })).toHaveLength(1);

    const picture = logo.parentElement;
    expect(picture?.tagName).toBe('PICTURE');
    const source = picture?.querySelector('source');
    expect(source).toHaveAttribute('srcset', '/logo-on-dark.svg');
    expect(source).toHaveAttribute('media', '(prefers-color-scheme: dark)');
  });

  // web-visual-foundation spec "The Maker Credit Appears on Screen Only".
  it('shows the maker credit once, as text and not as a link', () => {
    renderLoginPage();

    const credit = screen.getByTestId('login-credit');
    expect(credit).toHaveTextContent('A BCNSynergy product');
    expect(credit.closest('a')).toBeNull();
    expect(screen.getAllByText('A BCNSynergy product')).toHaveLength(1);

    // The navy mark is unreadable on the dark ground (browser pass), so it
    // swaps to a light variant the same way the logo does.
    const mark = credit.querySelector('img');
    expect(mark).toHaveAttribute('src', '/bcnsynergy-mark.svg');
    expect(mark).toHaveAttribute('alt', '');
    const source = mark?.parentElement?.querySelector('source');
    expect(source).toHaveAttribute('srcset', '/bcnsynergy-mark-on-dark.svg');
    expect(source).toHaveAttribute('media', '(prefers-color-scheme: dark)');
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
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 401 } as Response));
    renderLoginPage();

    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@sf-manager.example' },
    });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Invalid email or password.',
    );
  });

  // login-rate-limit spec "Rate-limited message" / "Form usable after rate
  // limit": a 429 gets its own message (no countdown, no digits) and the
  // form keeps working.
  it('shows the rate-limited message, not the invalid-credentials one, on a 429', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 429 } as Response));
    renderLoginPage();

    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@sf-manager.example' },
    });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    const error = await screen.findByTestId('login-error');
    expect(error).toHaveTextContent('Too many login attempts. Please try again later.');
    expect(error).not.toHaveTextContent('Invalid email or password.');
    expect(error.textContent).not.toMatch(/\d/);
  });

  it('stays usable after a 429: a later submit is sent and shows its own result', async () => {
    const rateLimited = mockFetch({ ok: false, status: 429 } as Response);
    vi.stubGlobal('fetch', rateLimited);
    renderLoginPage();

    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@sf-manager.example' },
    });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    await screen.findByText('Too many login attempts. Please try again later.');

    const unauthorized = mockFetch({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', unauthorized);
    fireEvent.change(screen.getByTestId('login-password'), {
      target: { value: 'another-password' },
    });
    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Invalid email or password.',
    );
    expect(unauthorized.mock.calls.some(([url]) => String(url).includes('/auth/login'))).toBe(true);
  });

  // web-alert-announcements spec "Action Errors Are Announced Each Time They
  // Are Shown" (EN-82).
  it('announces a repeated validation error again, as a new role="alert" element', async () => {
    renderLoginPage();

    fireEvent.click(screen.getByTestId('login-submit'));
    const first = await screen.findByRole('alert');
    expect(first).toHaveAttribute('data-testid', 'login-error');
    expect(first).toHaveClass('sf-alert', 'sf-alert-danger');
    expect(first).toHaveTextContent('Email and password are required.');

    fireEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
    expect(screen.getByRole('alert')).toHaveTextContent('Email and password are required.');
  });

  it('announces a repeated login failure again, as a new role="alert" element', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 401 } as Response));
    renderLoginPage();

    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@sf-manager.example' },
    });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    const first = await screen.findByRole('alert');
    expect(first).toHaveTextContent('Invalid email or password.');

    fireEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});

// auth-live-user-check spec "Session-Ended Notice": the flag is raised by a
// data call's 401 while a user is logged in. These tests reach it the real
// way (apiFetch -> AuthProvider handler) rather than faking the context.
describe('LoginPage — session-ended notice', () => {
  const NOTICE = 'Your session has ended. Please sign in again.';

  function sessionEndedFetch(loginOk: boolean, hangLogin = false) {
    const user = { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' };
    return vi.fn((url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => user } as Response);
      }
      if (href.includes('/auth/login')) {
        if (hangLogin) {
          return new Promise<Response>(() => undefined);
        }
        return Promise.resolve(
          loginOk
            ? ({ ok: true, json: async () => user } as Response)
            : ({ ok: false, status: 401 } as Response),
        );
      }
      return Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response);
    });
  }

  async function renderEndedSession(loginOk = false, hangLogin = false) {
    vi.stubGlobal('fetch', sessionEndedFetch(loginOk, hangLogin));
    renderLoginPage();
    // /auth/me resolves with a user; then a data call gets a 401.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await apiFetch('/users').catch(() => undefined);
    });
  }

  function fillAndSubmit() {
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@sf-manager.example' },
    });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'some-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));
  }

  it('shows the notice when the session ended', async () => {
    await renderEndedSession();

    expect(await screen.findByTestId('login-session-ended')).toHaveTextContent(NOTICE);
  });

  it('shows no notice on a fresh visit or after a failed login', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 401 } as Response));
    renderLoginPage();
    expect(screen.queryByTestId('login-session-ended')).not.toBeInTheDocument();

    fillAndSubmit();

    expect(await screen.findByTestId('login-error')).toBeInTheDocument();
    expect(screen.queryByTestId('login-session-ended')).not.toBeInTheDocument();
  });

  it('hides the notice while a login error is shown, and keeps it hidden after the error clears', async () => {
    await renderEndedSession(false, true);
    expect(await screen.findByTestId('login-session-ended')).toBeInTheDocument();

    // Empty submit: the validation error replaces the notice.
    fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toBeInTheDocument();
    expect(screen.queryByTestId('login-session-ended')).not.toBeInTheDocument();

    // A valid submit clears the error while the (hanging) login is in flight;
    // with no error and no flag reset the notice would reappear here.
    fillAndSubmit();
    await waitFor(() => expect(screen.queryByTestId('login-error')).not.toBeInTheDocument());
    expect(screen.queryByTestId('login-session-ended')).not.toBeInTheDocument();
  });
});

// web-locale-selection "Present on both surfaces": the login page carries the
// selector too, since no shell is mounted there.
describe('LoginPage language selector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ ok: true, json: async () => ({}) }));
  });

  afterEach(async () => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    document.documentElement.lang = 'en';
  });

  it('renders exactly one selector and switches the page language', async () => {
    renderLoginPage();

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByTestId('login-submit')).toHaveTextContent('Sign in');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Iniciar sesión'),
    );
  });

  it('shows a login error in the newly selected language', async () => {
    renderLoginPage();

    fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Email and password are required.',
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });

    await waitFor(() =>
      expect(screen.getByTestId('login-error')).toHaveTextContent(
        i18n.t('auth.validationRequired', { lng: 'es' }),
      ),
    );
    expect(screen.getByTestId('login-error')).not.toHaveTextContent(
      'Email and password are required.',
    );
  });

  it('shows the maker credit in the active locale', async () => {
    renderLoginPage();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ca' } });

    await waitFor(() =>
      expect(screen.getByTestId('login-credit')).toHaveTextContent('Un producte de BCNSynergy'),
    );
  });
});
