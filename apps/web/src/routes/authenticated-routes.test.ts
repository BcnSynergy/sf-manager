import { describe, expect, it } from 'vitest';
import { ELEMENT_HISTORY_ALLOWED_ROLES } from '../auth/element-history-route.roles';
import { ChecklistQuestionCreatePage } from '../pages/ChecklistQuestionCreatePage';
import { ChecklistQuestionEditPage } from '../pages/ChecklistQuestionEditPage';
import { ChecklistQuestionsListPage } from '../pages/ChecklistQuestionsListPage';
import { CommunitiesListPage } from '../pages/CommunitiesListPage';
import { CommunityCreatePage } from '../pages/CommunityCreatePage';
import { CommunityDetailPage } from '../pages/CommunityDetailPage';
import { CommunityEditPage } from '../pages/CommunityEditPage';
import { CommunityElementsListPage } from '../pages/CommunityElementsListPage';
import { ElementReviewHistoryPage } from '../pages/ElementReviewHistoryPage';
import { HealthPage } from '../pages/HealthPage';
import { InspectableElementCreatePage } from '../pages/InspectableElementCreatePage';
import { InspectableElementEditPage } from '../pages/InspectableElementEditPage';
import { InspectableElementLabelPage } from '../pages/InspectableElementLabelPage';
import { MaintenanceCompaniesListPage } from '../pages/MaintenanceCompaniesListPage';
import { MaintenanceCompanyCreatePage } from '../pages/MaintenanceCompanyCreatePage';
import { MaintenanceCompanyEditPage } from '../pages/MaintenanceCompanyEditPage';
import { OrganizationProfilePage } from '../pages/OrganizationProfilePage';
import { ReviewHistoryDetailPage } from '../pages/ReviewHistoryDetailPage';
import { ReviewHistoryPage } from '../pages/ReviewHistoryPage';
import { ReviewSessionDetailPage } from '../pages/ReviewSessionDetailPage';
import { ReviewSessionElementPage } from '../pages/ReviewSessionElementPage';
import { ReviewSessionNewPage } from '../pages/ReviewSessionNewPage';
import { ReviewSessionsPage } from '../pages/ReviewSessionsPage';
import { ReviewTemplateCreatePage } from '../pages/ReviewTemplateCreatePage';
import { ReviewTemplateDetailPage } from '../pages/ReviewTemplateDetailPage';
import { ReviewTemplatesListPage } from '../pages/ReviewTemplatesListPage';
import { UserCreatePage } from '../pages/UserCreatePage';
import { UserEditPage } from '../pages/UserEditPage';
import { UsersListPage } from '../pages/UsersListPage';
import { AUTHENTICATED_ROUTES } from './authenticated-routes';

// nav-menu/design.md Decision 1, "How route gating is verified end to end",
// step 1: this file imports the REAL AUTHENTICATED_ROUTES table and the REAL
// page components, with NO `vi.mock` of any kind, and asserts its
// `{ path, allowedRoles, elementType }` contents structurally against a
// literal expected 28-entry list. Deliberately kept in its own file, without
// `vi.mock`, so `element.type` can never resolve to a shared mock stub — see
// design.md's two-file split rationale.
const EXPECTED_ROUTES: {
  path: string;
  allowedRoles: string[] | undefined;
  elementType: unknown;
}[] = [
  { path: '/', allowedRoles: undefined, elementType: HealthPage },
  { path: '/users', allowedRoles: ['SYSTEM_ADMIN'], elementType: UsersListPage },
  { path: '/users/new', allowedRoles: ['SYSTEM_ADMIN'], elementType: UserCreatePage },
  { path: '/users/:id/edit', allowedRoles: ['SYSTEM_ADMIN'], elementType: UserEditPage },
  { path: '/communities', allowedRoles: ['SYSTEM_ADMIN'], elementType: CommunitiesListPage },
  {
    path: '/communities/new',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: CommunityCreatePage,
  },
  {
    path: '/communities/:id',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: CommunityDetailPage,
  },
  {
    path: '/communities/:id/edit',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: CommunityEditPage,
  },
  {
    path: '/communities/:communityId/inspectable-elements',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: CommunityElementsListPage,
  },
  {
    path: '/communities/:communityId/inspectable-elements/new',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: InspectableElementCreatePage,
  },
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/edit',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: InspectableElementEditPage,
  },
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/label',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: InspectableElementLabelPage,
  },
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/history',
    allowedRoles: ELEMENT_HISTORY_ALLOWED_ROLES,
    elementType: ElementReviewHistoryPage,
  },
  {
    path: '/maintenance-companies',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: MaintenanceCompaniesListPage,
  },
  {
    path: '/maintenance-companies/new',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: MaintenanceCompanyCreatePage,
  },
  {
    path: '/maintenance-companies/:id/edit',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: MaintenanceCompanyEditPage,
  },
  {
    path: '/checklist-questions',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: ChecklistQuestionsListPage,
  },
  {
    path: '/checklist-questions/new',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: ChecklistQuestionCreatePage,
  },
  {
    path: '/checklist-questions/:questionId/edit',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: ChecklistQuestionEditPage,
  },
  {
    path: '/review-templates',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: ReviewTemplatesListPage,
  },
  {
    path: '/review-templates/new',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: ReviewTemplateCreatePage,
  },
  {
    path: '/review-templates/:templateId',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: ReviewTemplateDetailPage,
  },
  {
    path: '/review-sessions',
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
    elementType: ReviewSessionsPage,
  },
  {
    path: '/review-sessions/new',
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
    elementType: ReviewSessionNewPage,
  },
  {
    path: '/review-sessions/:sessionId',
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
    elementType: ReviewSessionDetailPage,
  },
  {
    path: '/review-sessions/:sessionId/elements/:code',
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
    elementType: ReviewSessionElementPage,
  },
  {
    path: '/review-history',
    allowedRoles: [
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
      'MAINTENANCE_COMPANY_MANAGER',
      'SYSTEM_ADMIN',
      'MANAGER',
    ],
    elementType: ReviewHistoryPage,
  },
  {
    path: '/review-history/:sessionId',
    allowedRoles: [
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
      'MAINTENANCE_COMPANY_MANAGER',
      'SYSTEM_ADMIN',
      'MANAGER',
    ],
    elementType: ReviewHistoryDetailPage,
  },
  {
    path: '/organization-profile',
    allowedRoles: ['SYSTEM_ADMIN'],
    elementType: OrganizationProfilePage,
  },
];

describe('AUTHENTICATED_ROUTES', () => {
  it('has exactly 29 entries', () => {
    expect(AUTHENTICATED_ROUTES).toHaveLength(29);
  });

  it('matches path, allowedRoles and paired element component exactly, in order', () => {
    const actual = AUTHENTICATED_ROUTES.map(({ path, allowedRoles, element }) => ({
      path,
      allowedRoles,
      elementType: element.type,
    }));

    expect(actual).toEqual(EXPECTED_ROUTES);
  });
});
