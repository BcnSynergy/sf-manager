import { lazy, useState } from 'react';
import { createBrowserRouter, Route, RouterProvider, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PageSuspense } from './components/PageSuspense';
import { AUTHENTICATED_ROUTES } from './routes/authenticated-routes';

// TD-8: lazy like every authenticated page. LoginPage imports
// @sf-manager/validation (CommonJS, so not tree-shaken), which pulls zod in;
// loading it on demand keeps both out of the entry chunk.
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);

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
      <Route
        path="/login"
        element={
          <PageSuspense>
            <LoginPage />
          </PageSuspense>
        }
      />
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

// EN-129: a data router, so pages can use useBlocker (it throws under
// <BrowserRouter>). One catch-all route renders AppRoutes, which keeps the
// declarative <Routes> tree above as the single route table and lets tests
// keep mounting it in a MemoryRouter. Navigation only: no loaders or
// actions, so data fetching stays in the pages and api/ modules, not in
// route definitions.
function App() {
  const [router] = useState(() => createBrowserRouter([{ path: '*', element: <AppRoutes /> }]));
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
