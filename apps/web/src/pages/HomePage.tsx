import type { Role } from '@sf-manager/validation';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { groupNavItems, NAV_ITEMS_BY_ROLE } from '../layout/nav-items';
import { mapRoleToLabelKey } from '../users/role-labels';

function isKnownRole(role: string): role is Role {
  return Object.hasOwn(NAV_ITEMS_BY_ROLE, role);
}

// The landing page at "/": who is signed in, and one card per section the
// role's navigation offers (home-page slice 1). The cards come from the same
// NAV_ITEMS_BY_ROLE table as the sidebar, minus Home itself, so the page can
// never offer a section the navigation does not. An unrecognized role gets
// no card, exactly as it gets no navigation item (AppLayout).
export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const role = user && isKnownRole(user.role) ? user.role : null;
  const sections = role
    ? groupNavItems(NAV_ITEMS_BY_ROLE[role].filter((item) => item.group !== undefined))
    : [];

  return (
    <main>
      <PageHeader title={t('home.title')} />
      {user && (
        <p data-testid="home-signed-in">
          {role
            ? t('home.signedInAsWithRole', {
                email: user.email,
                role: t(mapRoleToLabelKey(role)),
              })
            : t('home.signedInAs', { email: user.email })}
        </p>
      )}
      <div className="sf-home-sections" data-testid="home-sections">
        {sections.map((section) => (
          <section
            key={section.group}
            className="sf-section"
            aria-labelledby={`home-group-${section.group}`}
          >
            <h2 className="sf-section-title" id={`home-group-${section.group}`}>
              {t(`nav.group.${section.group}`)}
            </h2>
            <ul className="sf-home-grid">
              {section.items.map((item) => (
                <li key={item.to}>
                  <Link className="sf-home-card" to={item.to}>
                    <span className="sf-home-card-title">{t(item.labelKey)}</span>
                    {item.descriptionKey && (
                      <span className="sf-home-card-text">{t(item.descriptionKey)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
