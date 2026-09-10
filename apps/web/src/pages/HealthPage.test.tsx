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

  // review-history-company-scope spec "The manager reaches history from the
  // app's entry page" / design.md Q5 (Decision 10): a MAINTENANCE_COMPANY_MANAGER
  // gets a control here that navigates directly to /review-history, never
  // through the /review-sessions write surface.
  it('shows a review-history entry link for a MAINTENANCE_COMPANY_MANAGER', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_COMPANY_MANAGER' }));
    renderHealthPage();

    const link = await screen.findByTestId('review-history-entry-link');
    expect(link).toHaveAttribute('href', '/review-history');
  });

  it('does not show a review-sessions entry link for a MAINTENANCE_COMPANY_MANAGER', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_COMPANY_MANAGER' }));
    renderHealthPage();

    await screen.findByTestId('review-history-entry-link');
    expect(screen.queryByTestId('review-sessions-entry-link')).not.toBeInTheDocument();
  });

  it('does not show a review-history entry link for a MAINTENANCE_TECHNICIAN or COMMUNITY_REPRESENTATIVE', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_TECHNICIAN' }));
    renderHealthPage();

    await screen.findByTestId('review-sessions-entry-link');
    expect(screen.queryByTestId('review-history-entry-link')).not.toBeInTheDocument();
  });

  // spec "The manager's path never crosses the write surface" +
  // "No write control is rendered for the manager": enumerate every
  // navigation control rendered on this page for a signed-in manager —
  // none navigates to /review-sessions or any session-performing view, and
  // the only controls present are the history link and logout.
  it('enumerates every navigation control for a MAINTENANCE_COMPANY_MANAGER — none leads to /review-sessions', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_COMPANY_MANAGER' }));
    renderHealthPage();

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/review-history']);
    expect(hrefs.some((href) => href?.startsWith('/review-sessions'))).toBe(false);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('data-testid', 'logout-button');
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
