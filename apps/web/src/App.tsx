import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AUTHENTICATED_ROUTES } from './routes/authenticated-routes';

// nav-menu/design.md Decision 1: the <Routes> tree is extracted into its own
// exported AppRoutes component so tests can mount it inside their own
// MemoryRouter without ever nesting a Router inside the shipped
// BrowserRouter (React Router rejects that). AUTHENTICATED_ROUTES is
// imported from routes/authenticated-routes.tsx (nav-menu/tasks.md Phase 2)
// and generates the wrapped <Route> children via .map() — not a hand-copied
// parallel array — so every route's path/element/allowedRoles stays a
// single source of truth.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* nav-menu/design.md Decision 1: /login is declared OUTSIDE the
          AppLayout wrapper and OUTSIDE AUTHENTICATED_ROUTES entirely — "no
          nav on /login" is structural, not a condition to remember. */}
      <Route element={<AppLayout />}>
        {AUTHENTICATED_ROUTES.map(({ path, element, allowedRoles }) => (
          <Route
            key={path}
            path={path}
            element={<ProtectedRoute allowedRoles={allowedRoles}>{element}</ProtectedRoute>}
          />
        ))}
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
