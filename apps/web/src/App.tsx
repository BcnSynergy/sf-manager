import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { ChecklistQuestionCreatePage } from './pages/ChecklistQuestionCreatePage';
import { ChecklistQuestionEditPage } from './pages/ChecklistQuestionEditPage';
import { ChecklistQuestionsListPage } from './pages/ChecklistQuestionsListPage';
import { CommunitiesListPage } from './pages/CommunitiesListPage';
import { CommunityCreatePage } from './pages/CommunityCreatePage';
import { CommunityDetailPage } from './pages/CommunityDetailPage';
import { CommunityEditPage } from './pages/CommunityEditPage';
import { CommunityElementsListPage } from './pages/CommunityElementsListPage';
import { HealthPage } from './pages/HealthPage';
import { InspectableElementCreatePage } from './pages/InspectableElementCreatePage';
import { InspectableElementEditPage } from './pages/InspectableElementEditPage';
import { LoginPage } from './pages/LoginPage';
import { MaintenanceCompaniesListPage } from './pages/MaintenanceCompaniesListPage';
import { MaintenanceCompanyCreatePage } from './pages/MaintenanceCompanyCreatePage';
import { MaintenanceCompanyEditPage } from './pages/MaintenanceCompanyEditPage';
import { ReviewTemplateCreatePage } from './pages/ReviewTemplateCreatePage';
import { ReviewTemplateDetailPage } from './pages/ReviewTemplateDetailPage';
import { ReviewTemplatesListPage } from './pages/ReviewTemplatesListPage';
import { UserCreatePage } from './pages/UserCreatePage';
import { UserEditPage } from './pages/UserEditPage';
import { UsersListPage } from './pages/UsersListPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HealthPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <UsersListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/new"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <UserCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <UserEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communities"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <CommunitiesListPage />
              </ProtectedRoute>
            }
          />
          {/* design.md "Route order note": the static /communities/new
              segment ranks above the dynamic /communities/:id segment
              (added in Phase 7) — React Router matches static path
              segments before dynamic ones regardless of declaration
              order, so this coexists safely once :id is added. */}
          <Route
            path="/communities/new"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <CommunityCreatePage />
              </ProtectedRoute>
            }
          />
          {/* design.md "Route order note" (same reasoning as /communities/new
              above): the static /communities/new segment ranks above this
              dynamic /communities/:id segment, and this depth-2 route is
              distinct from the depth-3 /communities/:id/edit below it — no
              ordering conflict against either. */}
          <Route
            path="/communities/:id"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <CommunityDetailPage />
              </ProtectedRoute>
            }
          />
          {/* design.md "Route order note" (same reasoning as /communities/new
              above): the static /communities/new segment already ranks above
              /communities/:id/edit's dynamic :id segment, and /communities/:id
              (Phase 7, above) is a distinct depth-2 route from this depth-3
              one — no ordering conflict between any of the three. */}
          <Route
            path="/communities/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <CommunityEditPage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 8: nested under the community, same
              `inspectable-elements` segment on the API and the web (Open
              Question 3 — no fork). This depth-3 route (:communityId is
              dynamic, `inspectable-elements` is a literal) never conflicts
              with `/communities/:id`/`/communities/:id/edit` above — those
              match on `:id` alone at depth 2/3 with no third literal
              segment, so Express/React Router never confuses the two
              families regardless of declaration order. */}
          <Route
            path="/communities/:communityId/inspectable-elements"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <CommunityElementsListPage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 8 (React Router ordering note): the static
              `new` segment ranks above a dynamic segment regardless of
              declaration order, and the `:elementId/edit` route below is
              depth 5 while this is depth 4 — no URL can match both, so no
              ordering conflict exists. */}
          <Route
            path="/communities/:communityId/inspectable-elements/new"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <InspectableElementCreatePage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 8 (React Router ordering note, same
              reasoning as the static `new` segment above): this depth-5
              dynamic route never conflicts with the depth-4 static `new`
              route above regardless of declaration order (React Router
              matches static segments first), and it never conflicts with
              `/communities/:id`/`/communities/:id/edit` for the same reason
              the list/create routes above do not. */}
          <Route
            path="/communities/:communityId/inspectable-elements/:elementId/edit"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <InspectableElementEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance-companies"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <MaintenanceCompaniesListPage />
              </ProtectedRoute>
            }
          />
          {/* design.md "Routes" + the /communities precedent above: the
              static /maintenance-companies/new segment ranks above the
              dynamic /maintenance-companies/:id/edit segment Phase 10 adds
              — React Router matches static path segments before dynamic
              ones regardless of declaration order, so this coexists safely
              once :id/edit is added. */}
          <Route
            path="/maintenance-companies/new"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <MaintenanceCompanyCreatePage />
              </ProtectedRoute>
            }
          />
          {/* design.md "Routes" + the /communities precedent above: this
              depth-3 dynamic route never conflicts with the static
              /maintenance-companies/new segment above regardless of
              declaration order (React Router matches static segments
              first). */}
          <Route
            path="/maintenance-companies/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <MaintenanceCompanyEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checklist-questions"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <ChecklistQuestionsListPage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 9 (React Router ordering note, same
              reasoning as /communities/new above): the static `new`
              segment ranks above the dynamic `:questionId/edit` segment
              below regardless of declaration order — React Router matches
              static path segments before dynamic ones. */}
          <Route
            path="/checklist-questions/new"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <ChecklistQuestionCreatePage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 9 (React Router ordering note, same
              reasoning as the static `new` segment above): this dynamic
              route never conflicts with the static `new` route above
              regardless of declaration order. */}
          <Route
            path="/checklist-questions/:questionId/edit"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <ChecklistQuestionEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review-templates"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <ReviewTemplatesListPage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 9 (React Router ordering note, same
              reasoning as /checklist-questions/new above): the static `new`
              segment ranks above the dynamic `:templateId` segment below
              regardless of declaration order — React Router matches static
              path segments before dynamic ones. */}
          <Route
            path="/review-templates/new"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <ReviewTemplateCreatePage />
              </ProtectedRoute>
            }
          />
          {/* design.md Decision 9 (React Router ordering note, same
              reasoning as the static `new` segment above): this dynamic
              route never conflicts with the static `new` route above
              regardless of declaration order. */}
          <Route
            path="/review-templates/:templateId"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <ReviewTemplateDetailPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
