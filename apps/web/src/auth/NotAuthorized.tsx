import { useTranslation } from 'react-i18next';

// spec.md "Role-Gated Route Access": an authenticated non-SYSTEM_ADMIN who
// reaches a gated route MUST see an explicit "not authorized" message, never
// a silent redirect. Rendered by ProtectedRoute when allowedRoles excludes
// the current user's role (design.md Decision 1). Pure render, no branching
// logic — mechanical per tasks.md.
export function NotAuthorized() {
  const { t } = useTranslation();

  return (
    <main data-testid="not-authorized">
      <h1>{t('common.notAuthorizedTitle')}</h1>
      <p>{t('common.notAuthorizedMessage')}</p>
    </main>
  );
}
