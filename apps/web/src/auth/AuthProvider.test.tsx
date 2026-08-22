import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

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
