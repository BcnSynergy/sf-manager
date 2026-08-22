import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from './AuthProvider';

type ProtectedRouteProps = {
  children: ReactNode;
};

// spec.md "Redirect When Unauthenticated": redirect to /login once the
// initial GET /auth/me check (AuthProvider) resolves without a session.
// While that check is in flight, render nothing rather than redirecting
// prematurely — the user might turn out to be authenticated.
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
