import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Role } from '@sf-manager/validation';
import { setUnauthorizedHandler } from '../api/client';

// role is returned as-is by both POST /auth/login and GET /auth/me
// (design.md "Data Flow") — the frontend does not decide or cache it
// independently. The API reads the user's role from the database on every
// authenticated request (ADR-011 addendum 2026-10-06), so the role held here
// is a snapshot from login or page load: it can lag a role change made
// elsewhere until the next reload, but the API never honors a stale role.
export type AuthUser = { id: string; email: string; role: Role };

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // True after a data call got a 401 while a user was logged in
  // (auth-live-user-check spec "Session-Ended Notice"). In memory only, so a
  // reload clears it.
  sessionEnded: boolean;
  clearSessionEnded: () => void;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The httpOnly access-token cookie is invisible to JS (design.md Decision 5),
// so session state can only be learned by asking the API via GET /auth/me —
// never by reading document.cookie.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  // Mirrors `user` for the 401 handler, which must read the current value
  // without re-registering. Assigned wherever setUser is called (never in an
  // effect, which would lag one render and reopen the logout race below).
  const userRef = useRef<AuthUser | null>(null);

  function updateUser(next: AuthUser | null) {
    userRef.current = next;
    setUser(next);
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
      .then((response) => (response.ok ? (response.json() as Promise<AuthUser>) : null))
      .then((data) => updateUser(data))
      .catch(() => updateUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  // design.md D4/D5: apiFetch reports every 401 here. Acts only when a user
  // is logged in, so a logged-out 401 raises no notice and several
  // concurrent 401s collapse into one transition. Cleanup keeps exactly one
  // live handler under StrictMode and none after unmount.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current === null) {
        return;
      }
      updateUser(null);
      setSessionEnded(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      // Per spec.md's anti-enumeration requirement: never surface whether
      // the email or the password was wrong — the caller (LoginPage) shows
      // one generic message regardless of the underlying reason.
      throw new Error('Login failed');
    }

    const data = (await response.json()) as AuthUser;
    setSessionEnded(false);
    updateUser(data);
  }

  async function logout(): Promise<void> {
    // Clear local session state regardless of whether the network request
    // reaches the server: a logout button that leaves the user stuck on an
    // authenticated page because of a transient network failure is worse
    // than a client-side view that says "logged out" while the server-side
    // revocation is attempted best-effort.
    //
    // The ref and flag are reset BEFORE the request so a data call's 401
    // landing mid-logout is ignored by the handler instead of showing the
    // session-ended notice after an explicit logout.
    userRef.current = null;
    setSessionEnded(false);
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Swallowed deliberately — see comment above.
    } finally {
      setSessionEnded(false);
      updateUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        sessionEnded,
        clearSessionEnded: () => setSessionEnded(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Tiny auth context: the provider and its consumer hook are meant to be used together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
