import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { AuthProvider } from '../auth/AuthProvider';
import { HealthPage } from './HealthPage';

function mockFetch(options: { logoutRejects?: boolean } = {}) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: '1', email: 'admin@sf-manager.example' }),
      } as Response);
    }
    if (href.includes('/auth/logout')) {
      return options.logoutRejects
        ? Promise.reject(new Error('network error'))
        : Promise.resolve({ ok: true } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });
}

function renderHealthPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HealthPage />} />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('HealthPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });

  it('renders the health check result once the API responds', async () => {
    renderHealthPage();

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );
  });

  it('renders a logout control that clears the session on click', async () => {
    renderHealthPage();

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );

    fireEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/logout'))).toBe(true);
    });

    await waitFor(() => expect(screen.getByTestId('login-page')).toBeInTheDocument());
  });

  it('still clears the session and navigates to /login when the logout request fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ logoutRejects: true }));
    renderHealthPage();

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );

    fireEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() => expect(screen.getByTestId('login-page')).toBeInTheDocument());
  });
});
