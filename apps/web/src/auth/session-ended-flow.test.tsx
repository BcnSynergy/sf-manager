import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { apiFetch } from '../api/client';
import { LoginPage } from '../pages/LoginPage';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';

// ADR-011 addendum 2026-10-06 item 6: no single test covered the whole
// "mid-session 401 -> redirect to /login -> session-ended notice" flow.
// Real AuthProvider, ProtectedRoute and LoginPage; only fetch is stubbed.
describe('mid-session 401 flow', () => {
  it('redirects a signed-in user to /login and shows the session-ended notice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) => {
        if (String(url).includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' }),
          } as Response);
        }
        // Any data call: the API answers 401 (the session ended server-side).
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response);
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-probe" />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByTestId('protected-probe')).toBeInTheDocument();

    await act(async () => {
      await apiFetch('/users').catch(() => undefined);
    });

    await waitFor(() => expect(screen.queryByTestId('protected-probe')).not.toBeInTheDocument());
    expect(screen.getByTestId('login-submit')).toBeInTheDocument();
    expect(screen.getByTestId('login-session-ended')).toBeInTheDocument();
  });
});
