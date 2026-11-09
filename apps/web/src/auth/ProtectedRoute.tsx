import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '@sf-manager/validation';
import { useAuth } from './AuthProvider';
import { NotAuthorized } from './NotAuthorized';
import { SessionUnavailable } from './SessionUnavailable';

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: Role[];
};

// spec.md "Redirect When Unauthenticated": redirect to /login once the
// initial GET /auth/me check (AuthProvider) resolves without a session.
// While that check is in flight, render nothing rather than redirecting
// prematurely — the user might turn out to be authenticated.
//
// design.md Decision 1: allowedRoles is optional so this component owns the
// 401-before-403 precedence in one place. Order matters: isLoading -> null,
// session check unavailable -> SessionUnavailable, no user -> /login, role not in allowedRoles -> NotAuthorized, otherwise
// (allowed role, or no allowedRoles prop at all) -> children. The last case
// keeps every existing caller that doesn't pass allowedRoles unchanged.
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading, sessionUnavailable, retrySessionCheck } = useAuth();

  if (isLoading) {
    return null;
  }

  // authentication spec "Session Check Unavailable on Load (Web)": a failed
  // check is not a signed-out visitor, so offer a retry instead of /login.
  if (!user && sessionUnavailable) {
    return <SessionUnavailable onRetry={retrySessionCheck} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <NotAuthorized />;
  }

  return children;
}
