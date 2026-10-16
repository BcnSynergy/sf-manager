import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { LanguageSelector } from '../components/LanguageSelector';
import { PageSuspense } from '../components/PageSuspense';
import { groupNavItems, NAV_ITEMS_BY_ROLE } from './nav-items';

// nav-menu/design.md Decision 2: the one authenticated shell. It owns no
// state, fetches nothing, and reads exactly two values from useAuth() plus
// the logout function. Wired into App.tsx's route tree as a pathless
// <Route element={<AppLayout />}> wrapper (nav-menu/tasks.md Phase 3).
export function AppLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // spec "Logout Moves Into the Navigation": unchanged behaviour, new home
  // — HealthPage.tsx's own copy was removed in nav-menu/tasks.md Phase 3.
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

  // ui-redesign-foundation design Decision 6: a grouped sidebar beside the
  // page, and a footer with the maker credit under it. `.app-nav` and
  // `.app-footer` are the print-chrome selectors the print guard checks
  // (styles/check-app-nav-print-suppression.ts). The wordmark is not a link,
  // so the nav's links stay exactly the role's items.
  return (
    <div className="sf-shell">
      {showNav && user && (
        <nav className="app-nav sf-side" data-testid="nav-root" aria-label={t('nav.label')}>
          <div className="sf-wordmark" data-testid="nav-wordmark">
            <img src="/favicon.svg" alt="" />
            <span>
              <span className="sf-wordmark-sf">SF</span>-Manager
            </span>
          </div>
          {groupNavItems(items).map((section) => (
            <div
              key={section.group ?? 'home'}
              className="sf-side-group"
              data-testid={`nav-group-${section.group ?? 'home'}`}
              // A labelled group is announced with its label; Home has none.
              role={section.group ? 'group' : undefined}
              aria-labelledby={section.group ? `nav-group-label-${section.group}` : undefined}
            >
              {section.group && (
                <p
                  className="sf-side-label"
                  id={`nav-group-label-${section.group}`}
                  data-testid={`nav-group-label-${section.group}`}
                >
                  {t(`nav.group.${section.group}`)}
                </p>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="sf-side-link"
                  data-testid={item.testId}
                >
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="sf-side-foot">
            <span className="sf-user" data-testid="nav-user-email">
              {user.email}
            </span>
            <div className="sf-side-controls">
              <LanguageSelector />
              <button
                type="button"
                className="sf-btn-ghost"
                data-testid="nav-logout-button"
                onClick={() => void handleLogout()}
              >
                {t('auth.logoutLabel')}
              </button>
            </div>
          </div>
        </nav>
      )}
      <div className="sf-main">
        {/* TD-8: pages are lazy-loaded chunks (routes/authenticated-routes.tsx).
            The nav stays visible while a page's chunk downloads or fails. */}
        <PageSuspense resetKey={location.pathname}>
          <Outlet />
        </PageSuspense>
        {showNav && (
          <footer className="app-footer sf-footer" data-testid="app-footer">
            <span className="sf-credit">
              <picture>
                <source
                  srcSet="/bcnsynergy-mark-on-dark.svg"
                  media="(prefers-color-scheme: dark)"
                />
                <img src="/bcnsynergy-mark.svg" alt="" />
              </picture>
              {t('brand.credit')}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
