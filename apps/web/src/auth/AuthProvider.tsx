import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Role } from '@sf-manager/validation';

// role is signed into the JWT and returned as-is by both POST /auth/login
// and GET /auth/me (design.md "Data Flow") — the frontend does not decide
// or cache it independently. It may lag a role change made elsewhere in
// the system by up to the access token's lifetime; see design.md Decision 2
// and the ADR-011 addendum ("role staleness accepted").
export type AuthUser = { id: string; email: string; role: Role };

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The httpOnly access-token cookie is invisible to JS (design.md Decision 5),
// so session state can only be learned by asking the API via GET /auth/me —
// never by reading document.cookie.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
      .then((response) => (response.ok ? (response.json() as Promise<AuthUser>) : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
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
    setUser(data);
  }

  async function logout(): Promise<void> {
    // Clear local session state regardless of whether the network request
    // reaches the server: a logout button that leaves the user stuck on an
    // authenticated page because of a transient network failure is worse
    // than a client-side view that says "logged out" while the server-side
    // revocation is attempted best-effort.
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Swallowed deliberately — see comment above.
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
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
