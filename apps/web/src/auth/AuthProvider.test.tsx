import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiFetch, setUnauthorizedHandler } from '../api/client';
import { AuthProvider, useAuth } from './AuthProvider';

// Wraps the real setUnauthorizedHandler so a test can assert what
// AuthProvider registers and clears, while apiFetch keeps the real module
// state (auth-live-user-check design.md D4/D5).
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, setUnauthorizedHandler: vi.fn(actual.setUnauthorizedHandler) };
});


// Renders the raw fields useAuth() exposes so tests can assert on the
// consumer-visible shape of `user`, including `role` — the field this PR adds.
function UserProbe() {
  const { user, login } = useAuth();
  return (
    <div>
      <span data-testid="probe-role">{user?.role ?? 'none'}</span>
      <button
        data-testid="probe-login"
        onClick={() => {
          void login('admin@sf-manager.example', 'irrelevant-password');
        }}
      >
        login
      </button>
    </div>
  );
}

function mockFetch(options: {
  meRole?: string;
  meFails?: boolean;
  loginRole?: string;
} = {}) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      if (options.meFails) {
        return Promise.resolve({ ok: false } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: '1',
          email: 'admin@sf-manager.example',
          role: options.meRole ?? 'SYSTEM_ADMIN',
        }),
      } as Response);
    }
    if (href.includes('/auth/login')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: '1',
          email: 'admin@sf-manager.example',
          role: options.loginRole ?? 'SYSTEM_ADMIN',
        }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch to ${href}`));
  });
}

describe('AuthProvider — role propagation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });

  it('exposes role from the initial GET /auth/me session check', async () => {
    render(
      <AuthProvider>
        <UserProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe-role')).toHaveTextContent('SYSTEM_ADMIN'));
  });

  it('exposes a different role value from /auth/me (triangulation)', async () => {
    vi.stubGlobal('fetch', mockFetch({ meRole: 'MANAGER' }));

    render(
      <AuthProvider>
        <UserProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe-role')).toHaveTextContent('MANAGER'));
  });

  it('exposes role returned by POST /auth/login', async () => {
    vi.stubGlobal('fetch', mockFetch({ meFails: true, loginRole: 'MAINTENANCE_COMPANY_MANAGER' }));

    render(
      <AuthProvider>
        <UserProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe-role')).toHaveTextContent('none'));

    await act(async () => {
      screen.getByTestId('probe-login').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('probe-role')).toHaveTextContent('MAINTENANCE_COMPANY_MANAGER'),
    );
  });
});

// Probe for the session-ended flag (auth-live-user-check spec "Session-Ended
// Notice"): exposes user, sessionEnded and the actions the tests drive.
function SessionProbe() {
  const { user, sessionEnded, login, logout, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="probe-loading">{String(isLoading)}</span>
      <span data-testid="probe-user">{user?.email ?? 'none'}</span>
      <span data-testid="probe-ended">{String(sessionEnded)}</span>
      <button
        data-testid="probe-login"
        onClick={() => {
          void login('admin@sf-manager.example', 'irrelevant-password');
        }}
      >
        login
      </button>
      <button
        data-testid="probe-logout"
        onClick={() => {
          void logout();
        }}
      >
        logout
      </button>
    </div>
  );
}

type SessionFetchOptions = {
  loggedIn: boolean;
  logout?: () => Promise<Response>;
};

function sessionFetch(options: SessionFetchOptions) {
  const user = { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' };
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve(
        options.loggedIn
          ? ({ ok: true, json: async () => user } as Response)
          : ({ ok: false } as Response),
      );
    }
    if (href.includes('/auth/login')) {
      return Promise.resolve({ ok: true, json: async () => user } as Response);
    }
    if (href.includes('/auth/logout')) {
      return options.logout
        ? options.logout()
        : Promise.resolve({ ok: true, status: 204 } as Response);
    }
    // Any data call: the API answers 401 (the session ended server-side).
    return Promise.resolve({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);
  });
}

async function renderSession(options: SessionFetchOptions) {
  vi.stubGlobal('fetch', sessionFetch(options));
  const view = render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('false'));
  return view;
}

async function dataCall401() {
  await act(async () => {
    await apiFetch('/users').catch(() => undefined);
  });
}

describe('AuthProvider — session ended on a mid-session 401', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
    vi.mocked(setUnauthorizedHandler).mockClear();
  });

  it('clears the user and raises sessionEnded on a 401 while logged in', async () => {
    await renderSession({ loggedIn: true });
    expect(screen.getByTestId('probe-user')).toHaveTextContent('admin@sf-manager.example');

    await dataCall401();

    expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-ended')).toHaveTextContent('true');
  });

  it('raises no flag on a 401 while logged out', async () => {
    await renderSession({ loggedIn: false });

    await dataCall401();

    expect(screen.getByTestId('probe-ended')).toHaveTextContent('false');
  });

  it('collapses two 401s into one transition', async () => {
    await renderSession({ loggedIn: true });

    await act(async () => {
      await Promise.all([
        apiFetch('/users').catch(() => undefined),
        apiFetch('/communities').catch(() => undefined),
      ]);
    });

    expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-ended')).toHaveTextContent('true');
  });

  it('clears the flag on a successful login()', async () => {
    await renderSession({ loggedIn: true });
    await dataCall401();
    expect(screen.getByTestId('probe-ended')).toHaveTextContent('true');

    await act(async () => {
      screen.getByTestId('probe-login').click();
    });

    await waitFor(() => expect(screen.getByTestId('probe-ended')).toHaveTextContent('false'));
    expect(screen.getByTestId('probe-user')).toHaveTextContent('admin@sf-manager.example');
  });

  it('shows no notice when a 401 lands while logout() is in flight', async () => {
    let finishLogout!: () => void;
    await renderSession({
      loggedIn: true,
      logout: () =>
        new Promise<Response>((resolve) => {
          finishLogout = () => resolve({ ok: true, status: 204 } as Response);
        }),
    });

    await act(async () => {
      screen.getByTestId('probe-logout').click();
    });
    await dataCall401();
    await act(async () => {
      finishLogout();
    });

    await waitFor(() => expect(screen.getByTestId('probe-user')).toHaveTextContent('none'));
    expect(screen.getByTestId('probe-ended')).toHaveTextContent('false');
  });

  it('clears the handler when the provider unmounts', async () => {
    const view = await renderSession({ loggedIn: true });
    expect(vi.mocked(setUnauthorizedHandler).mock.calls.at(-1)?.[0]).toBeTypeOf('function');

    view.unmount();

    expect(vi.mocked(setUnauthorizedHandler).mock.calls.at(-1)?.[0]).toBeNull();
  });
});
