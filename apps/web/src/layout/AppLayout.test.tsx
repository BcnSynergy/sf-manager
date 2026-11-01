import { lazy } from 'react';
import type { ComponentType } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { Role } from '@sf-manager/validation';
import i18n from '../i18n';
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
            <Route
              path="/review-history"
              element={<div data-testid="outlet-content">history</div>}
            />
            <Route
              path="/review-sessions"
              element={<div data-testid="outlet-content">sessions</div>}
            />
            <Route
              path="/review-schedule"
              element={<div data-testid="outlet-content">schedule</div>}
            />
            <Route
              path="/organization-profile/logo"
              element={<div data-testid="outlet-content">logo</div>}
            />
          </Route>
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// ui-redesign-foundation app-navigation delta: same item set per role, in the
// grouped sidebar order (Home, then Operations, Setup, Administration).
const EXPECTED_ITEM_TESTIDS: Record<Role, string[]> = {
  SYSTEM_ADMIN: [
    'nav-link-home',
    'nav-link-review-schedule',
    'nav-link-review-history',
    'nav-link-communities',
    'nav-link-maintenance-companies',
    'nav-link-review-templates',
    'nav-link-checklist-questions',
    'nav-link-users',
    'nav-link-organization-profile',
  ],
  MANAGER: ['nav-link-home', 'nav-link-review-schedule', 'nav-link-review-history'],
  MAINTENANCE_COMPANY_MANAGER: ['nav-link-home', 'nav-link-review-history'],
  MAINTENANCE_TECHNICIAN: [
    'nav-link-home',
    'nav-link-review-schedule',
    'nav-link-review-sessions',
    'nav-link-review-history',
  ],
  COMMUNITY_REPRESENTATIVE: [
    'nav-link-home',
    'nav-link-review-schedule',
    'nav-link-review-sessions',
    'nav-link-review-history',
  ],
};

const EXPECTED_GROUP_LABELS: Record<Role, string[]> = {
  SYSTEM_ADMIN: ['Operations', 'Setup', 'Administration'],
  MANAGER: ['Operations'],
  MAINTENANCE_COMPANY_MANAGER: ['Operations'],
  MAINTENANCE_TECHNICIAN: ['Operations'],
  COMMUNITY_REPRESENTATIVE: ['Operations'],
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

  // review-schedule-ui "Navigation Placement for the Four Roles" and the
  // app-navigation delta: the item is decided by role alone.
  describe('review schedule item', () => {
    it.each<Role>([
      'SYSTEM_ADMIN',
      'MANAGER',
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
    ])('%s is offered one item targeting /review-schedule', async (role) => {
      vi.stubGlobal('fetch', mockFetch({ role }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      const item = within(nav).getAllByTestId('nav-link-review-schedule');
      expect(item).toHaveLength(1);
      expect(item[0]).toHaveAttribute('href', '/review-schedule');
      expect(item[0]).toHaveTextContent('Review schedule');
    });

    it('MAINTENANCE_COMPANY_MANAGER is offered no item and no /review-schedule link', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_COMPANY_MANAGER' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(within(nav).queryByTestId('nav-link-review-schedule')).not.toBeInTheDocument();
      const hrefs = within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'));
      expect(hrefs).not.toContain('/review-schedule');
    });

    it('gives the system administrator exactly nine sections', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'SYSTEM_ADMIN' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(within(nav).getAllByRole('link')).toHaveLength(9);
    });

    it('decides the manager nav by role alone: the same items, and no capability lookup', async () => {
      const fetchStub = mockFetch({ role: 'MANAGER' });
      vi.stubGlobal('fetch', fetchStub);
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => link.getAttribute('data-testid')),
      ).toEqual(['nav-link-home', 'nav-link-review-schedule', 'nav-link-review-history']);
      const urls = fetchStub.mock.calls.map(([url]) => String(url));
      expect(urls.every((url) => url.includes('/auth/me'))).toBe(true);
    });

    it('leads to the page, never to the not-authorized view', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'MAINTENANCE_TECHNICIAN' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      fireEvent.click(within(nav).getByTestId('nav-link-review-schedule'));

      expect(await screen.findByText('schedule')).toBeInTheDocument();
      expect(screen.queryByTestId('not-authorized')).not.toBeInTheDocument();
    });

    // review-session-ui / review-history-ui deltas: the item is a permitted
    // global-navigation entry, while the view's OWN controls (the outlet,
    // outside the nav) stay free of any schedule control.
    it.each([
      ['/review-sessions', 'MAINTENANCE_TECHNICIAN'],
      ['/review-sessions', 'COMMUNITY_REPRESENTATIVE'],
      ['/review-history', 'MAINTENANCE_TECHNICIAN'],
      ['/review-history', 'MANAGER'],
    ] as [string, Role][])(
      'shows the item in the nav on %s for %s while the view itself has no schedule control',
      async (path, role) => {
        vi.stubGlobal('fetch', mockFetch({ role }));
        renderAppLayout([path]);

        const nav = await screen.findByTestId('nav-root');
        expect(within(nav).getByTestId('nav-link-review-schedule')).toBeInTheDocument();
        const outlet = screen.getByTestId('outlet-content');
        expect(within(outlet).queryAllByRole('link')).toHaveLength(0);
        expect(outlet.closest('nav')).toBeNull();
        expect(nav).not.toContainElement(outlet);
      },
    );
  });

  // app-navigation delta "The Navigation Is a Grouped Sidebar Without Toggle
  // State", "The Navigation Shows the Signed-In User's Email"; web-visual-
  // foundation "The Maker Credit Appears on Screen Only".
  describe('sidebar shell', () => {
    it.each(Object.entries(EXPECTED_GROUP_LABELS) as [Role, string[]][])(
      '%s sees exactly its non-empty group labels, in order, each before its items',
      async (role, labels) => {
        vi.stubGlobal('fetch', mockFetch({ role }));
        renderAppLayout();

        const nav = await screen.findByTestId('nav-root');
        expect(within(nav).queryByTestId('nav-group-home')).toBeInTheDocument();
        const groupLabels = within(nav)
          .queryAllByTestId(/^nav-group-label-/)
          .map((label) => label.textContent);
        expect(groupLabels).toEqual(labels);

        const operations = within(nav).getByTestId('nav-group-operations');
        expect(operations.firstElementChild).toHaveTextContent('Operations');
      },
    );

    it('reads the admin group labels and links interleaved in document order', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'SYSTEM_ADMIN' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(
        within(nav)
          .getAllByTestId(/^nav-(group-label|link)-/)
          .map((element) => element.getAttribute('data-testid')),
      ).toEqual([
        'nav-link-home',
        'nav-group-label-operations',
        'nav-link-review-schedule',
        'nav-link-review-history',
        'nav-group-label-setup',
        'nav-link-communities',
        'nav-link-maintenance-companies',
        'nav-link-review-templates',
        'nav-link-checklist-questions',
        'nav-group-label-administration',
        'nav-link-users',
        'nav-link-organization-profile',
      ]);
    });

    it('exposes each labelled group to assistive technology by its label', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'SYSTEM_ADMIN' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(
        within(nav)
          .getAllByRole('group')
          .map((group) => group.getAttribute('aria-labelledby')),
      ).toHaveLength(3);
      const operations = within(nav).getByRole('group', { name: 'Operations' });
      expect(
        within(operations)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Review schedule', 'Review history']);
    });

    it('renders no Setup or Administration group for a manager', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'MANAGER' }));
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      expect(within(nav).queryByTestId('nav-group-setup')).not.toBeInTheDocument();
      expect(within(nav).queryByTestId('nav-group-administration')).not.toBeInTheDocument();
      expect(within(nav).queryByText('Setup')).not.toBeInTheDocument();
    });

    it('shows the wordmark, and it is not a link', async () => {
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      const wordmark = within(nav).getByTestId('nav-wordmark');
      expect(wordmark).toHaveTextContent('SF-Manager');
      expect(wordmark.closest('a')).toBeNull();
      expect(within(wordmark).queryAllByRole('link')).toHaveLength(0);
    });

    it("shows the signed-in user's email as plain text, without any extra request", async () => {
      const fetchStub = mockFetch({ role: 'MAINTENANCE_TECHNICIAN' });
      vi.stubGlobal('fetch', fetchStub);
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      const email = within(nav).getByTestId('nav-user-email');
      expect(email).toHaveTextContent('user@sf-manager.example');
      expect(email.closest('a, button')).toBeNull();
      const urls = fetchStub.mock.calls.map(([url]) => String(url));
      expect(urls.every((url) => url.includes('/auth/me'))).toBe(true);
    });

    it('renders the footer credit with the nav, outside the nav, and not as a link', async () => {
      renderAppLayout();

      const nav = await screen.findByTestId('nav-root');
      const footer = screen.getByTestId('app-footer');
      expect(footer).toHaveTextContent('A BCNSynergy product');
      expect(nav).not.toContainElement(footer);
      expect(within(footer).queryAllByRole('link')).toHaveLength(0);
    });

    it('renders no footer while the session is still resolving', () => {
      renderAppLayout();

      expect(screen.queryByTestId('app-footer')).not.toBeInTheDocument();
    });
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

    // EN-127: the logo page is part of the organization profile, so its nav
    // entry stays current there.
    it('keeps the organization profile current on its logo page', async () => {
      vi.stubGlobal('fetch', mockFetch({ role: 'SYSTEM_ADMIN' }));
      renderAppLayout(['/organization-profile/logo']);

      const nav = await screen.findByTestId('nav-root');
      const current = within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute('data-testid', 'nav-link-organization-profile');
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

// web-locale-selection / app-navigation delta: the shell carries exactly one
// language selector, inside the nav, and switching it re-labels the nav.
describe('AppLayout language selector', () => {
  afterEach(async () => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    document.documentElement.lang = 'en';
  });

  it('renders exactly one selector inside the nav and switches the nav language', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderAppLayout();

    const nav = await screen.findByTestId('nav-root');
    const selectors = within(nav).getAllByRole('combobox');
    expect(selectors).toHaveLength(1);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);

    fireEvent.change(selectors[0], { target: { value: 'es' } });

    await waitFor(() => expect(screen.getByTestId('nav-link-home')).toHaveTextContent('Inicio'));
  });

  it('labels the groups and the credit in the active locale', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'SYSTEM_ADMIN' }));
    renderAppLayout();

    const nav = await screen.findByTestId('nav-root');
    fireEvent.change(within(nav).getByRole('combobox'), { target: { value: 'ca' } });

    await waitFor(() =>
      expect(
        within(nav)
          .getAllByTestId(/^nav-group-label-/)
          .map((label) => label.textContent),
      ).toEqual(['Operacions', 'Configuració', 'Administració']),
    );
    expect(screen.getByTestId('app-footer')).toHaveTextContent('Un producte de BCNSynergy');
  });
});

// TD-8: pages are lazy-loaded chunks. While one downloads, the nav stays and
// a loading message shows; if one fails to load (network error, or a stale
// tab asking for a chunk a redeploy removed), the page area shows an error
// with a reload button instead of the whole app going blank.
describe('AppLayout lazy page loading (TD-8)', () => {
  const PendingPage = lazy(() => new Promise<{ default: ComponentType }>(() => {}));
  const FailingPage = lazy(() =>
    Promise.reject<{ default: ComponentType }>(
      new Error('Failed to fetch dynamically imported module'),
    ),
  );

  function renderWithLazyRoutes(initialEntries: string[]) {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div data-testid="outlet-content">home</div>} />
              <Route path="/pending" element={<PendingPage />} />
              <Route path="/failing" element={<FailingPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  // TD-38: the nav waits for /auth/me, while the page area renders its
  // Suspense fallback (or chunk error) on the first render. Delaying the
  // session response makes that order deterministic, as on a loaded machine,
  // so each test must wait for the nav before checking the page area.
  beforeEach(() => {
    const authFetch = mockFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: RequestInfo | URL) =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(authFetch(url)), 50);
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the page-loading message with the nav still present while a page chunk downloads', async () => {
    renderWithLazyRoutes(['/pending']);

    expect(await screen.findByTestId('nav-root')).toBeInTheDocument();
    expect(screen.getByTestId('page-loading')).toHaveTextContent('Loading page…');
  });

  it('shows a page-load error with a reload button, nav still present, when a page chunk fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithLazyRoutes(['/failing']);

    expect(await screen.findByTestId('nav-root')).toBeInTheDocument();
    expect(await screen.findByTestId('page-load-error')).toHaveTextContent(
      'This page could not be loaded. Reload to try again.',
    );
    expect(screen.getByTestId('page-load-reload')).toHaveTextContent('Reload');
    expect(screen.getByTestId('nav-root')).toBeInTheDocument();
  });

  it('clears the page-load error when the user navigates to another page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithLazyRoutes(['/failing']);
    await screen.findByTestId('nav-root');
    await screen.findByTestId('page-load-error');

    fireEvent.click(screen.getByTestId('nav-link-home'));

    expect(await screen.findByTestId('outlet-content')).toHaveTextContent('home');
    expect(screen.queryByTestId('page-load-error')).not.toBeInTheDocument();
  });
});
