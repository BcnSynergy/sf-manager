import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@sf-manager/validation';
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

// review-history-company-scope spec "Role-Gated Route Access for the
// History Views" (MODIFIED): the /review-history* routes in App.tsx use
// this exact 3-role array. Exercised here against the generic
// ProtectedRoute mechanism (App.tsx itself has no dedicated route test
// file, per this repo's existing precedent) rather than booting the full
// app with real auth.
describe('ProtectedRoute with the review-history route family (3 allowed roles)', () => {
  const REVIEW_HISTORY_ALLOWED_ROLES: Role[] = [
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
    'MAINTENANCE_COMPANY_MANAGER',
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

  it('another role is denied with an explicit "not authorized" message, not a silent redirect', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'manager@sf-manager.example', role: 'MANAGER' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderReviewHistoryRoute();

    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

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
