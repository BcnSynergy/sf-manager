import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { NAV_ITEMS_BY_ROLE } from './nav-items';

// nav-menu/design.md Decision 2: the one authenticated shell. It owns no
// state, fetches nothing, and reads exactly two values from useAuth() plus
// the logout function. Wired into App.tsx's route tree as a pathless
// <Route element={<AppLayout />}> wrapper in a later PR of this change
// (nav-menu/tasks.md Phase 3) — this PR ships the component standalone.
export function AppLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // spec "Logout Moves Into the Navigation": unchanged behaviour, new home
  // — HealthPage.tsx still has its own copy today; removing it is scoped to
  // PR3 (nav-menu/tasks.md Phase 3), not this PR.
  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // Same precedence ProtectedRoute already owns: loading -> nothing, no user
  // -> nothing. <Outlet /> ALWAYS renders, so ProtectedRoute's redirect and
  // its null loading render are untouched by this wrapper.
  //
  // The nav (INCLUDING logout) is gated on `!isLoading && user` alone, NOT
  // on `items` being non-empty: AuthProvider.tsx casts /auth/me's response
  // with no runtime validation of `role`. If `user.role` is ever outside
  // the five known Role values, NAV_ITEMS_BY_ROLE[user.role] is undefined —
  // falling back to an empty list keeps the nav (and logout) rendering
  // instead of silently disappearing. Losing the nav's item list to an
  // unrecognized role is tolerable; losing the user's only way to log out
  // is not.
  const showNav = !isLoading && Boolean(user);
  // Object.hasOwn, not `?? []` alone: if `user.role` is ever a string that
  // collides with an inherited Object.prototype key ('constructor',
  // 'toString', etc — only reachable via a hostile/corrupt /auth/me
  // payload), a plain NAV_ITEMS_BY_ROLE[user.role] lookup returns an
  // inherited function rather than undefined, so `?? []` would not fire and
  // .map() would throw, white-screening the whole app.
  const items =
    showNav && user && Object.hasOwn(NAV_ITEMS_BY_ROLE, user.role)
      ? NAV_ITEMS_BY_ROLE[user.role as keyof typeof NAV_ITEMS_BY_ROLE]
      : [];

  return (
    <>
      {showNav && (
        <nav className="app-nav" data-testid="nav-root" aria-label={t('nav.label')}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} data-testid={item.testId}>
              {t(item.labelKey)}
            </NavLink>
          ))}
          <button
            type="button"
            data-testid="nav-logout-button"
            onClick={() => void handleLogout()}
          >
            {t('auth.logoutLabel')}
          </button>
        </nav>
      )}
      <Outlet />
    </>
  );
}
