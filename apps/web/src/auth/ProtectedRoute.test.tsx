import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@sf-manager/validation';
import { ELEMENT_HISTORY_ALLOWED_ROLES } from './element-history-route.roles';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from './AuthProvider';

vi.mock('./AuthProvider', async () => {
  const actual = await vi.importActual<typeof import('./AuthProvider')>('./AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">secret</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('renders nothing while the initial session check is in flight', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('renders the protected content when authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});

describe('ProtectedRoute with allowedRoles', () => {
  function renderWithAllowedRoles(allowedRoles: Role[]) {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={allowedRoles}>
                <div data-testid="protected-content">secret</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders nothing while the initial session check is in flight, even with allowedRoles set', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderWithAllowedRoles(['SYSTEM_ADMIN']);

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('not-authorized')).not.toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated, even with allowedRoles set (401 before 403)', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderWithAllowedRoles(['SYSTEM_ADMIN']);

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('not-authorized')).not.toBeInTheDocument();
  });

  it('renders NotAuthorized when authenticated but role is not in allowedRoles', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'manager@sf-manager.example', role: 'MANAGER' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderWithAllowedRoles(['SYSTEM_ADMIN']);

    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('renders the protected content when the role is in allowedRoles', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderWithAllowedRoles(['SYSTEM_ADMIN']);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});

// review-history-admin-scope spec "Role-Gated Route Access for the History
// Views" (MODIFIED) + review-history-manager-capability design.md
// Decision 7: the /review-history* routes in authenticated-routes.tsx use
// this exact 5-role array — MANAGER joins the four shipped roles (gated on
// the role alone; its actual visibility is a server-side capability check,
// not a route concern), the /review-sessions* write surface stays
// untouched. Exercised here against the generic ProtectedRoute mechanism
// (App.test.tsx and authenticated-routes.test.ts are the dedicated route
// test files, nav-menu/tasks.md Phase 2/3) rather than booting the full app
// with real auth.
describe('ProtectedRoute with the review-history route family (5 allowed roles)', () => {
  const REVIEW_HISTORY_ALLOWED_ROLES: Role[] = [
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
    'MAINTENANCE_COMPANY_MANAGER',
    'SYSTEM_ADMIN',
    'MANAGER',
  ];

  function renderReviewHistoryRoute() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={REVIEW_HISTORY_ALLOWED_ROLES}>
                <div data-testid="protected-content">history</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('a technician reaches the history views (regression)', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'tech@sf-manager.example', role: 'MAINTENANCE_TECHNICIAN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('a representative reaches the identical history views (regression)', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'rep@sf-manager.example', role: 'COMMUNITY_REPRESENTATIVE' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('a maintenance company manager reaches the identical history views', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'manager@sf-manager.example', role: 'MAINTENANCE_COMPANY_MANAGER' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('a system admin reaches the identical history views', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  // review-history-manager-capability design.md Decision 7: the fifth and
  // last role, reaching the identical surface — granted or not, the route
  // itself never distinguishes; that's the capability checker's job,
  // server-side.
  it('a manager reaches the identical history views', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'manager@sf-manager.example', role: 'MANAGER' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  // review-history-admin-scope spec: the admin's new reviewSession:read
  // permission is read-only history access — it must NOT widen
  // /review-sessions*, the write surface. Asserted here against the write
  // route's own 2-role array (unchanged by this slice) with an explicit
  // "not authorized" message, not a redirect — same shape as the denial
  // case above, proving SYSTEM_ADMIN is blocked exactly like any other
  // role outside that array.
  it('a system admin is blocked from /review-sessions* with an explicit "not authorized" message, not a redirect', () => {
    const REVIEW_SESSIONS_ALLOWED_ROLES: Role[] = [
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
    ];

    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={REVIEW_SESSIONS_ALLOWED_ROLES}>
                <div data-testid="protected-content">write-surface</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  // review-history-manager-capability design.md: with MANAGER now in the
  // allowed-roles array, all five roles this app has reach /review-history*
  // — there is no substitute role left to exercise the "denied" branch of
  // this specific 5-role array (the shipped `INERT_NON_ADMIN_ROLES`-shaped
  // "another role is denied" case this test used to cover no longer has a
  // role to stand in for it). The denial branch itself stays covered by the
  // generic `ProtectedRoute with allowedRoles` describe block above (line
  // 75) and by the `/review-sessions*` denial test directly below.
  it('an unauthenticated visitor is redirected to /login', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('not-authorized')).not.toBeInTheDocument();
  });
});

// review-history-per-element/design.md Decision 7 + authenticated-routes.tsx's
// route comment: `/communities/:communityId/inspectable-elements/:elementId/
// history` uses the IDENTICAL 5-role array as `/review-history*` above —
// DELIBERATELY, unlike every other route in the `inspectable-elements`
// family (list, `/new`, `/edit`, `/label`), which stays SYSTEM_ADMIN-only.
// This block pins BOTH facts the in-file authenticated-routes.tsx comment
// calls out: the five roles reach this route, and its SYSTEM_ADMIN-only
// siblings do not widen alongside it.
//
// verify-report.md W-4: `ELEMENT_HISTORY_ALLOWED_ROLES` is imported from
// `./element-history-route.roles` (the same module `authenticated-routes.tsx`
// imports it from, not hand-declared here) so an accidental narrowing of
// the real route's `allowedRoles` in `authenticated-routes.tsx` fails this
// suite via an import-level mismatch, instead of silently passing against a
// stale local copy.
describe('ProtectedRoute for the element review-history route (5 allowed roles, admin-only siblings unchanged)', () => {
  it('the exported roles are exactly the 5 the anomaly comment promises', () => {
    expect(ELEMENT_HISTORY_ALLOWED_ROLES).toEqual<Role[]>([
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
      'MAINTENANCE_COMPANY_MANAGER',
      'SYSTEM_ADMIN',
      'MANAGER',
    ]);
  });

  function renderElementHistoryRoute() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={ELEMENT_HISTORY_ALLOWED_ROLES}>
                <div data-testid="protected-content">element-history</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it.each(ELEMENT_HISTORY_ALLOWED_ROLES)('%s reaches the element history route', (role) => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'user@sf-manager.example', role },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderElementHistoryRoute();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  // The anomaly's other half: `/edit` and `/label` (and the element list)
  // stay SYSTEM_ADMIN-only — a non-admin role that DOES reach the history
  // route above must still be denied on the admin-only sibling family,
  // proving the widened access did not "leak" to its neighbours.
  it('a non-admin role that reaches element history is still blocked from the SYSTEM_ADMIN-only sibling routes (/edit, /label)', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'tech@sf-manager.example', role: 'MAINTENANCE_TECHNICIAN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <div data-testid="protected-content">admin-only-sibling</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});
