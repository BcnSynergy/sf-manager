import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { CommunitiesListPage } from './pages/CommunitiesListPage';
import { CommunityCreatePage } from './pages/CommunityCreatePage';
import { CommunityDetailPage } from './pages/CommunityDetailPage';
import { CommunityEditPage } from './pages/CommunityEditPage';
import { HealthPage } from './pages/HealthPage';
import { LoginPage } from './pages/LoginPage';
import { MaintenanceCompaniesListPage } from './pages/MaintenanceCompaniesListPage';
import { MaintenanceCompanyCreatePage } from './pages/MaintenanceCompanyCreatePage';
import { MaintenanceCompanyEditPage } from './pages/MaintenanceCompanyEditPage';
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
