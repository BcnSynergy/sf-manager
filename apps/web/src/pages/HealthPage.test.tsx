import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { AuthProvider } from '../auth/AuthProvider';
import { HealthPage } from './HealthPage';

function mockFetch(
  options: { logoutRejects?: boolean; role?: string } = {},
) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: '1',
          email: 'admin@sf-manager.example',
          role: options.role ?? 'SYSTEM_ADMIN',
        }),
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

  // review-session-ui spec "Both Non-Admin Roles Have a Reachable Entry
  // Point": a logged-in MAINTENANCE_TECHNICIAN or COMMUNITY_REPRESENTATIVE
  // MUST be able to navigate into the review-session flow from here.
  it('shows a review-sessions entry link for a MAINTENANCE_TECHNICIAN', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_TECHNICIAN' }));
    renderHealthPage();

    const link = await screen.findByTestId('review-sessions-entry-link');
    expect(link).toHaveAttribute('href', '/review-sessions');
  });

  it('shows the identical review-sessions entry link for a COMMUNITY_REPRESENTATIVE', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'COMMUNITY_REPRESENTATIVE' }));
    renderHealthPage();

    const link = await screen.findByTestId('review-sessions-entry-link');
    expect(link).toHaveAttribute('href', '/review-sessions');
  });

  it('does not show a review-sessions entry link for a SYSTEM_ADMIN', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'SYSTEM_ADMIN' }));
    renderHealthPage();

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );
    expect(screen.queryByTestId('review-sessions-entry-link')).not.toBeInTheDocument();
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
