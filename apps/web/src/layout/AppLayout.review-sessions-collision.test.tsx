import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Role } from '@sf-manager/validation';
import '../i18n';
import * as reviewSessionApi from '../api/review-session';
import { AuthProvider } from '../auth/AuthProvider';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { ReviewSessionsPage } from '../pages/ReviewSessionsPage';
import { AppLayout } from './AppLayout';
import { mockAuthFetch } from './test-support/mock-auth-fetch';

// nav-menu verify-report WARNING-1: design.md's Testing Strategy "No
// collision" row requires rendering ReviewSessionsPage as a CHILD of
// AppLayout (i.e. with the real nav in the tree) and asserting
// `getByTestId('review-history-entry-link')` resolves to exactly one node.
// `ReviewSessionsPage.test.tsx` alone can never detect this either way — it
// never renders the nav. This is the missing guard.
vi.mock('../api/review-session');

const mockedListOwnReviewSessions = vi.mocked(reviewSessionApi.listOwnReviewSessions);

// code-review finding (second round): the route element must be wrapped in
// ProtectedRoute exactly as App.tsx wires every authenticated route (see
// authenticated-routes.tsx's /review-sessions entry for the real
// allowedRoles) — ProtectedRoute renders `null` while auth is loading and
// only mounts `children` once `/auth/me` resolves, so omitting it here would
// let AuthProvider's fetch and ReviewSessionsPage's load run as genuinely
// independent promise chains, which is NOT what happens in production.
const REVIEW_SESSIONS_ALLOWED_ROLES: Role[] = [
  'MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE',
];

function renderReviewSessionsInsideLayout(role: string) {
  vi.stubGlobal('fetch', mockAuthFetch({ role }));
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/review-sessions']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="/review-sessions"
              element={
                <ProtectedRoute allowedRoles={REVIEW_SESSIONS_ALLOWED_ROLES}>
                  <ReviewSessionsPage />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('AppLayout + ReviewSessionsPage — no testid collision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListOwnReviewSessions.mockResolvedValue([]);
  });

  // Both field roles get a Review sessions nav item (design.md Decision 3),
  // so both are exercised — a real triangulation, not a single sample:
  // getByTestId throws if it matches zero OR more than one node, so this
  // assertion would fail immediately if the nav ever reused
  // `review-history-entry-link` for its own "Review history" link.
  it.each<Role>(['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'])(
    '%s sees exactly one review-history-entry-link node with the nav rendered',
    async (role) => {
      renderReviewSessionsInsideLayout(role);

      // ProtectedRoute only mounts ReviewSessionsPage once AuthProvider's
      // /auth/me resolves, and ReviewSessionsPage then starts its own
      // listOwnReviewSessions() load on top of that — two sequential async
      // steps, so wait for the actual assertion target instead of a
      // synchronous getByTestId.
      expect(await screen.findByTestId('review-history-entry-link')).toBeInTheDocument();
    },
  );
});
