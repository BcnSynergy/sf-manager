import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { CommunitiesListPage } from './pages/CommunitiesListPage';
import { CommunityCreatePage } from './pages/CommunityCreatePage';
import { CommunityEditPage } from './pages/CommunityEditPage';
import { HealthPage } from './pages/HealthPage';
import { LoginPage } from './pages/LoginPage';
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
              above): the static /communities/new segment already ranks above
              /communities/:id/edit's dynamic :id segment, and /communities/:id
              (added in Phase 7) is a distinct depth-2 route from this
              depth-3 one — no ordering conflict between any of the three. */}
          <Route
            path="/communities/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <CommunityEditPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
