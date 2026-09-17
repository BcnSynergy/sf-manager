import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Role } from '@sf-manager/validation';
import '../i18n';
import * as reviewSessionApi from '../api/review-session';
import { AuthProvider } from '../auth/AuthProvider';
import { ReviewSessionsPage } from '../pages/ReviewSessionsPage';
import { AppLayout } from './AppLayout';

// nav-menu verify-report WARNING-1: design.md's Testing Strategy "No
// collision" row requires rendering ReviewSessionsPage as a CHILD of
// AppLayout (i.e. with the real nav in the tree) and asserting
// `getByTestId('review-history-entry-link')` resolves to exactly one node.
// `ReviewSessionsPage.test.tsx` alone can never detect this either way — it
// never renders the nav. This is the missing guard.
vi.mock('../api/review-session');

const mockedListOwnReviewSessions = vi.mocked(reviewSessionApi.listOwnReviewSessions);

function mockFetch(role: string) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: '1', email: 'user@sf-manager.example', role }),
      } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });
}

function renderReviewSessionsInsideLayout(role: string) {
  vi.stubGlobal('fetch', mockFetch(role));
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/review-sessions']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/review-sessions" element={<ReviewSessionsPage />} />
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

      // AuthProvider's /auth/me fetch and ReviewSessionsPage's own
      // listOwnReviewSessions() load are independent promise chains — nav-root
      // resolving says nothing about ReviewSessionsPage's load state, so wait
      // for the actual assertion target instead of a synchronous getByTestId.
      expect(await screen.findByTestId('review-history-entry-link')).toBeInTheDocument();
    },
  );
});
