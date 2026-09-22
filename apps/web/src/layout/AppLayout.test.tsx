import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Role } from '@sf-manager/validation';
import '../i18n';
import { AuthProvider } from '../auth/AuthProvider';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppLayout } from './AppLayout';
import { mockAuthFetch as mockFetch } from './test-support/mock-auth-fetch';

// nav-menu/design.md Decision 2/7: AppLayout is exercised the same way
// HealthPage.test.tsx exercised the logout flow it replaces — a REAL
// AuthProvider with global fetch stubbed, never a mocked useAuth() — because
// AuthProvider.logout() swallows its own errors internally (try/catch/
// finally), so a mocked logout() rejecting would never reach
// AppLayout.handleLogout at all and would prove nothing about its actual
// swallow-and-navigate behaviour.
//
// code-review finding (second round): this helper is now shared with
// AppLayout.review-sessions-collision.test.tsx via
// ./test-support/mock-auth-fetch — see that module for the full shape.

// One outlet route per path any test below navigates to — mirrors the
// pathless <Route element={<AppLayout />}> wrapper design.md Decision 1/2
// describes, without wiring the real route table (that lands in PR2/PR3).
function renderAppLayout(initialEntries: string[] = ['/']) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div data-testid="outlet-content">home</div>} />
            <Route path="/users" element={<div data-testid="outlet-content">users</div>} />
            <Route path="/review-history" element={<div data-testid="outlet-content">history</div>} />
            <Route path="/review-sessions" element={<div data-testid="outlet-content">sessions</div>} />
          </Route>
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const EXPECTED_ITEM_TESTIDS: Record<Role, string[]> = {
  SYSTEM_ADMIN: [
    'nav-link-home',
    'nav-link-users',
    'nav-link-communities',
    'nav-link-maintenance-companies',
    'nav-link-checklist-questions',
    'nav-link-review-templates',
    'nav-link-review-history',
    'nav-link-organization-profile',
  ],
  MANAGER: ['nav-link-home', 'nav-link-review-history'],
  MAINTENANCE_COMPANY_MANAGER: ['nav-link-home', 'nav-link-review-history'],
  MAINTENANCE_TECHNICIAN: ['nav-link-home', 'nav-link-review-sessions', 'nav-link-review-history'],
  COMMUNITY_REPRESENTATIVE: ['nav-link-home', 'nav-link-review-sessions', 'nav-link-review-history'],
};

describe('AppLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });

  describe('role -> items matrix', () => {
    it.each(Object.entries(EXPECTED_ITEM_TESTIDS) as [Role, string[]][])(
      '%s sees exactly its own item set',
      async (role, expectedTestIds) => {
        vi.stubGlobal('fetch', mockFetch({ role }));
        renderAppLayout();

        const nav = await screen.findByTestId('nav-root');
        const links = within(nav).getAllByRole('link');
        expect(links.map((link) => link.getAttribute('data-testid'))).toEqual(expectedTestIds);
      },
    );
  });

  describe('write-surface guard', () => {
    it.each<Role>(['SYSTEM_ADMIN', 'MANAGER', 'MAINTENANCE_COMPANY_MANAGER'])(
      '%s is never offered a /review-sessions link',
      async (role) => {
        vi.stubGlobal('fetch', mockFetch({ role }));
        renderAppLayout();

        const nav = await screen.findByTestId('nav-root');
        const hrefs = within(nav)
          .getAllByRole('link')
          .map((link) => link.getAttribute('href'));
        expect(hrefs.some((href) => href?.startsWith('/review-sessions'))).toBe(false);
      },
    );
  });

  describe('render gating', () => {
    it('renders no nav while the session is still resolving', () => {
      renderAppLayout();

      expect(screen.queryByTestId('nav-root')).not.toBeInTheDocument();
    });

    it('renders no nav when there is no signed-in user, but still renders the outlet', async () => {
      vi.stubGlobal('fetch', mockFetch({ authFails: true }));
      renderAppLayout();

      await waitFor(() => expect(screen.getByTestId('outlet-content')).toBeInTheDocument());
      expect(screen.queryByTestId('nav-root')).not.toBeInTheDocument();
    });
  });

  describe('unrecognized-role fallback', () => {
    it('still renders a working nav and logout for a role outside the known Role union', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'BOGUS_ROLE' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(within(nav).queryAllByRole('link')).toHaveLength(0);
      expect(within(nav).getByTestId('nav-logout-button')).toBeInTheDocument();
    });

    it('falls back safely for a role string that collides with an Object.prototype key', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'constructor' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(within(nav).queryAllByRole('link')).toHaveLength(0);
      expect(within(nav).getByTestId('nav-logout-button')).toBeInTheDocument();
    });
  });

  describe('current-page indication', () => {
    it('marks exactly one item as current on a deep route', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'COMMUNITY_REPRESENTATIVE' }));
      renderAppLayout(['/review-history']);

      const nav = await screen.findByTestId('nav-root');
      const current = within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute('data-testid', 'nav-link-review-history');
    });
  });

  // nav-menu/tasks.md 3.3: unskipped now that App.tsx wires ProtectedRoute
  // inside the layout route (design.md Decision 1 — NotAuthorized is
  // ProtectedRoute's own return value, i.e. the layout's <Outlet /> content,
  // so it inherits the nav "for free"). A wrong-role user rendered through a
  // real ProtectedRoute inside the layout shows BOTH not-authorized and
  // nav-root.
  it('renders the nav around the NotAuthorized view', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'MANAGER' }));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/restricted']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route
                path="/restricted"
                element={
                  <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                    <div data-testid="outlet-content">restricted</div>
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="/login" element={<div data-testid="login-page">login</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await screen.findByTestId('not-authorized');
    expect(screen.getByTestId('nav-root')).toBeInTheDocument();
  });

  describe('logout', () => {
    it('clears the session and navigates to /login on success', async () => {
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      fireEvent.click(within(nav).getByTestId('nav-logout-button'));

      await waitFor(() => {
        const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/logout'))).toBe(
          true,
        );
      });
      await waitFor(() => expect(screen.getByTestId('login-page')).toBeInTheDocument());
    });

    // design.md Decision 7 correction: AuthProvider.logout() never rejects —
    // it swallows the error itself — so this exercises the real swallow
    // behaviour via a real AuthProvider + a rejecting fetch stub, the same
    // pattern HealthPage.test.tsx's equivalent case still uses today (its
    // removal is scoped to PR3, not this PR).
    it('still clears the session and navigates to /login when the logout request fails', async () => {
      vi.stubGlobal('fetch', mockFetch({ logoutRejects: true }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      fireEvent.click(within(nav).getByTestId('nav-logout-button'));

      await waitFor(() => expect(screen.getByTestId('login-page')).toBeInTheDocument());
    });
  });
});
