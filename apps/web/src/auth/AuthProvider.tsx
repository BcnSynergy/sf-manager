import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@sf-manager/validation';
import {
  ApiError,
  advanceSessionEpoch,
  refreshSession,
  setUnauthorizedHandler,
  settleRefresh,
} from '../api/client';

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
  // True when the session check on load could not tell whether the visitor
  // is signed in (API unreachable or failing). Cleared by a successful
  // check or login.
  sessionUnavailable: boolean;
  // Runs the session check again, without reloading the page.
  retrySessionCheck: () => void;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
// Deadline for GET /auth/me on load, body included.
const SESSION_CHECK_TIMEOUT_MS = 10_000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The httpOnly access-token cookie is invisible to JS (design.md Decision 5),
// so session state can only be learned by asking the API via GET /auth/me —
// never by reading document.cookie.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const sessionCheckIdRef = useRef(0);
  // Mirrors `user` for the 401 handler, which must read the current value
  // without re-registering. Assigned wherever setUser is called (never in an
  // effect, which would lag one render and reopen the logout race below).
  const userRef = useRef<AuthUser | null>(null);

  function updateUser(next: AuthUser | null) {
    userRef.current = next;
    setUser(next);
  }

  // authentication spec "Session Check Unavailable on Load (Web)": only a 401
  // whose refresh is refused means signed out. Anything else that fails (no
  // network, 5xx, 429, an unavailable refresh, an unreadable answer) leaves
  // the session unknown, so ProtectedRoute offers a retry instead of /login.
  // isLoading starts true, so the mount-time run needs no setState of its own;
  // a retry sets it first (retrySessionCheck below).
  function checkSession() {
    // Only the latest check may settle: a login (or a newer check) bumps the
    // id, so a slow retry that answers afterwards cannot overwrite it.
    const checkId = ++sessionCheckIdRef.current;
    const isCurrent = () => checkId === sessionCheckIdRef.current;
    // A server that accepts the connection but never answers would leave the
    // page blank; past the deadline the check counts as unavailable. The
    // refresh below has its own deadline (REFRESH_TIMEOUT_MS in api/client).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
    // TD-5 S8: the access cookie may have expired while the refresh cookie
    // is still good, so a 401 from /auth/me tries one refresh before the
    // visitor counts as logged out.
    fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include', signal: controller.signal })
      .then((response) => {
        if (response.ok) {
          return response.json() as Promise<AuthUser>;
        }
        // Only an expired or missing access token (401) is worth a refresh.
        if (response.status === HTTP_UNAUTHORIZED) {
          return refreshSession<AuthUser>();
        }
        // Rate-limited or failing: the session may still be valid. Any other
        // answer is final, and retrying would get the same one.
        if (response.status === HTTP_TOO_MANY_REQUESTS || response.status >= HTTP_SERVER_ERROR) {
          throw new ApiError(response.status);
        }
        return null;
      })
      .then((data) => {
        if (!isCurrent()) return;
        setSessionUnavailable(false);
        updateUser(data);
      })
      .catch(() => {
        if (!isCurrent()) return;
        setSessionUnavailable(true);
        updateUser(null);
      })
      .finally(() => {
        clearTimeout(timer);
        if (isCurrent()) setIsLoading(false);
      });
  }

  useEffect(checkSession, []);

  // design.md D4/D5: apiFetch reports every 401 here. Acts only when a user
  // is logged in, so a logged-out 401 raises no notice and several
  // concurrent 401s collapse into one transition. Cleanup keeps exactly one
  // live handler under StrictMode and none after unmount.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current === null) {
        return;
      }
      // The session ends here: 401s from the same epoch checked afterwards
      // skip the handler (design.md Decision 3).
      advanceSessionEpoch();
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
      // the email or the password was wrong. Only the HTTP status is
      // exposed, so the caller (LoginPage) can tell a rate-limited 429 from
      // every other rejection and show one generic message for the rest.
      throw new ApiError(response.status);
    }

    // stale-401-session-guard design.md Decision 3: the new Set-Cookie is
    // applied when the headers arrive, so this is the session boundary.
    // Advance before any further await and before updateUser makes the new
    // session visible to the handler; otherwise a 401 from a request issued
    // under the previous session could still end this one.
    advanceSessionEpoch();
    const data = (await response.json()) as AuthUser;
    // A session check still in flight (a retry) must not overwrite this login.
    sessionCheckIdRef.current += 1;
    setIsLoading(false);
    setSessionEnded(false);
    setSessionUnavailable(false);
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
    advanceSessionEpoch();
    setSessionEnded(false);
    try {
      // TD-5: a refresh in flight could otherwise set a fresh access cookie
      // after the logout cleared it.
      await settleRefresh();
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
        sessionUnavailable,
        retrySessionCheck: () => {
          setIsLoading(true);
          checkSession();
        },
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
