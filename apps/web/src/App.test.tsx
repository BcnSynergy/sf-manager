import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Role } from '@sf-manager/validation';
import '../src/i18n';
import { AuthProvider } from './auth/AuthProvider';
import { AppRoutes } from './App';
import { AUTHENTICATED_ROUTES } from './routes/authenticated-routes';

// nav-menu/design.md Decision 1, "How route gating is verified end to end"
// step 2: the exhaustive structural-wiring test. Every one of the 29 page
// components imported (transitively, via authenticated-routes.tsx) by
// App.tsx is replaced by a static, top-level `vi.mock` call with a literal
// specifier — Vitest's hoisting only rewrites statically-recognizable
// `vi.mock` calls, so these MUST be written out individually, not
// generated in a loop. Each stub renders a distinct marker derived from its
// own module/component name (`page-stub-<Name>`), never a shared trivial
// placeholder, so this suite can additionally assert rendered-component
// identity per path, not just nav presence/absence and gating.
vi.mock('./pages/HealthPage', () => ({
  HealthPage: () => <div data-testid="page-stub-HealthPage">HealthPage</div>,
}));
vi.mock('./pages/UsersListPage', () => ({
  UsersListPage: () => <div data-testid="page-stub-UsersListPage">UsersListPage</div>,
}));
vi.mock('./pages/UserCreatePage', () => ({
  UserCreatePage: () => <div data-testid="page-stub-UserCreatePage">UserCreatePage</div>,
}));
vi.mock('./pages/UserEditPage', () => ({
  UserEditPage: () => <div data-testid="page-stub-UserEditPage">UserEditPage</div>,
}));
vi.mock('./pages/CommunitiesListPage', () => ({
  CommunitiesListPage: () => (
    <div data-testid="page-stub-CommunitiesListPage">CommunitiesListPage</div>
  ),
}));
vi.mock('./pages/CommunityCreatePage', () => ({
  CommunityCreatePage: () => (
    <div data-testid="page-stub-CommunityCreatePage">CommunityCreatePage</div>
  ),
}));
vi.mock('./pages/CommunityDetailPage', () => ({
  CommunityDetailPage: () => (
    <div data-testid="page-stub-CommunityDetailPage">CommunityDetailPage</div>
  ),
}));
vi.mock('./pages/CommunityEditPage', () => ({
  CommunityEditPage: () => <div data-testid="page-stub-CommunityEditPage">CommunityEditPage</div>,
}));
vi.mock('./pages/CommunityElementsListPage', () => ({
  CommunityElementsListPage: () => (
    <div data-testid="page-stub-CommunityElementsListPage">CommunityElementsListPage</div>
  ),
}));
vi.mock('./pages/InspectableElementCreatePage', () => ({
  InspectableElementCreatePage: () => (
    <div data-testid="page-stub-InspectableElementCreatePage">InspectableElementCreatePage</div>
  ),
}));
vi.mock('./pages/InspectableElementEditPage', () => ({
  InspectableElementEditPage: () => (
    <div data-testid="page-stub-InspectableElementEditPage">InspectableElementEditPage</div>
  ),
}));
vi.mock('./pages/InspectableElementLabelPage', () => ({
  InspectableElementLabelPage: () => (
    <div data-testid="page-stub-InspectableElementLabelPage">InspectableElementLabelPage</div>
  ),
}));
vi.mock('./pages/ElementReviewHistoryPage', () => ({
  ElementReviewHistoryPage: () => (
    <div data-testid="page-stub-ElementReviewHistoryPage">ElementReviewHistoryPage</div>
  ),
}));
vi.mock('./pages/MaintenanceCompaniesListPage', () => ({
  MaintenanceCompaniesListPage: () => (
    <div data-testid="page-stub-MaintenanceCompaniesListPage">MaintenanceCompaniesListPage</div>
  ),
}));
vi.mock('./pages/MaintenanceCompanyCreatePage', () => ({
  MaintenanceCompanyCreatePage: () => (
    <div data-testid="page-stub-MaintenanceCompanyCreatePage">MaintenanceCompanyCreatePage</div>
  ),
}));
vi.mock('./pages/MaintenanceCompanyEditPage', () => ({
  MaintenanceCompanyEditPage: () => (
    <div data-testid="page-stub-MaintenanceCompanyEditPage">MaintenanceCompanyEditPage</div>
  ),
}));
vi.mock('./pages/ChecklistQuestionsListPage', () => ({
  ChecklistQuestionsListPage: () => (
    <div data-testid="page-stub-ChecklistQuestionsListPage">ChecklistQuestionsListPage</div>
  ),
}));
vi.mock('./pages/ChecklistQuestionCreatePage', () => ({
  ChecklistQuestionCreatePage: () => (
    <div data-testid="page-stub-ChecklistQuestionCreatePage">ChecklistQuestionCreatePage</div>
  ),
}));
vi.mock('./pages/ChecklistQuestionEditPage', () => ({
  ChecklistQuestionEditPage: () => (
    <div data-testid="page-stub-ChecklistQuestionEditPage">ChecklistQuestionEditPage</div>
  ),
}));
vi.mock('./pages/ReviewTemplatesListPage', () => ({
  ReviewTemplatesListPage: () => (
    <div data-testid="page-stub-ReviewTemplatesListPage">ReviewTemplatesListPage</div>
  ),
}));
vi.mock('./pages/ReviewTemplateCreatePage', () => ({
  ReviewTemplateCreatePage: () => (
    <div data-testid="page-stub-ReviewTemplateCreatePage">ReviewTemplateCreatePage</div>
  ),
}));
vi.mock('./pages/ReviewTemplateDetailPage', () => ({
  ReviewTemplateDetailPage: () => (
    <div data-testid="page-stub-ReviewTemplateDetailPage">ReviewTemplateDetailPage</div>
  ),
}));
vi.mock('./pages/ReviewSessionsPage', () => ({
  ReviewSessionsPage: () => (
    <div data-testid="page-stub-ReviewSessionsPage">ReviewSessionsPage</div>
  ),
}));
vi.mock('./pages/ReviewSessionNewPage', () => ({
  ReviewSessionNewPage: () => (
    <div data-testid="page-stub-ReviewSessionNewPage">ReviewSessionNewPage</div>
  ),
}));
vi.mock('./pages/ReviewSessionDetailPage', () => ({
  ReviewSessionDetailPage: () => (
    <div data-testid="page-stub-ReviewSessionDetailPage">ReviewSessionDetailPage</div>
  ),
}));
vi.mock('./pages/ReviewSessionElementPage', () => ({
  ReviewSessionElementPage: () => (
    <div data-testid="page-stub-ReviewSessionElementPage">ReviewSessionElementPage</div>
  ),
}));
vi.mock('./pages/ReviewHistoryPage', () => ({
  ReviewHistoryPage: () => <div data-testid="page-stub-ReviewHistoryPage">ReviewHistoryPage</div>,
}));
vi.mock('./pages/ReviewHistoryDetailPage', () => ({
  ReviewHistoryDetailPage: () => (
    <div data-testid="page-stub-ReviewHistoryDetailPage">ReviewHistoryDetailPage</div>
  ),
}));
vi.mock('./pages/OrganizationProfilePage', () => ({
  OrganizationProfilePage: () => (
    <div data-testid="page-stub-OrganizationProfilePage">OrganizationProfilePage</div>
  ),
}));

const ALL_ROLES: Role[] = [
  'SYSTEM_ADMIN',
  'MANAGER',
  'MAINTENANCE_COMPANY_MANAGER',
  'MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE',
];

function mockFetch(options: { role?: string } = {}) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: '1',
          email: 'user@sf-manager.example',
          role: options.role ?? 'SYSTEM_ADMIN',
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });
}

// Concrete substitutes for every dynamic path segment this table declares —
// MemoryRouter needs a real, matchable URL, not the `:param` template.
function toConcretePath(path: string): string {
  return path
    .replace(':communityId', 'community-1')
    .replace(':elementId', 'element-1')
    .replace(':questionId', 'question-1')
    .replace(':templateId', 'template-1')
    .replace(':sessionId', 'session-1')
    .replace(':code', 'code-1')
    .replace(':id', 'id-1');
}

function renderApp(initialEntries: string[], role?: string) {
  vi.stubGlobal('fetch', mockFetch({ role }));
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Renders a table entry's own `element` in isolation to read off the exact
// stub marker it produces — the oracle for "which component does this path
// EXPECT to render", derived straight from the imported `AUTHENTICATED_ROUTES`
// entry itself, not a hand-typed duplicate list.
function expectedMarkerOf(element: ReactElement): string {
  const { container, unmount } = render(element);
  const marker = container.querySelector('[data-testid^="page-stub-"]')?.getAttribute('data-testid');
  unmount();
  if (!marker) {
    throw new Error('Expected a page-stub-* marker in the rendered route element.');
  }
  return marker;
}

describe('AppRoutes structural wiring (exhaustive)', () => {
  // nav-menu/design.md Decision 1, step 2: iterates the real, imported
  // AUTHENTICATED_ROUTES array (not a hand-typed sample) — 29 entries.
  it.each(AUTHENTICATED_ROUTES.map((route) => [route.path, route] as const))(
    '%s renders under AppLayout with its paired component and an allowed role',
    async (path, route) => {
      const expectedMarker = expectedMarkerOf(route.element);
      const allowedRole = route.allowedRoles?.[0] ?? 'SYSTEM_ADMIN';

      renderApp([toConcretePath(path)], allowedRole);

      await screen.findByTestId(expectedMarker);
      expect(screen.getByTestId('nav-root')).toBeInTheDocument();
    },
  );

  // Denial branch: only meaningful for routes that don't already admit every
  // role (the two 5-role /review-history* entries have no role left to deny).
  const deniableRoutes = AUTHENTICATED_ROUTES.filter(
    (route) => route.allowedRoles !== undefined && route.allowedRoles.length < ALL_ROLES.length,
  );

  it.each(deniableRoutes.map((route) => [route.path, route] as const))(
    '%s shows NotAuthorized (with the nav still present) for a role outside allowedRoles',
    async (path, route) => {
      const deniedRole = ALL_ROLES.find((role) => !route.allowedRoles?.includes(role));
      if (!deniedRole) {
        throw new Error(`No role available to deny for ${path}`);
      }

      renderApp([toConcretePath(path)], deniedRole);

      await screen.findByTestId('not-authorized');
      expect(screen.getByTestId('nav-root')).toBeInTheDocument();
    },
  );

  // The 30th case: /login is declared OUTSIDE AUTHENTICATED_ROUTES and
  // outside the AppLayout wrapper entirely — structural, not conditional.
  it('renders /login with no nav', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await screen.findByTestId('login-email');
    expect(screen.queryByTestId('nav-root')).not.toBeInTheDocument();
  });
});
