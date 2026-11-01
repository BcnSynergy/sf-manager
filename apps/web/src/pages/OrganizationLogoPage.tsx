import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { getOrganizationProfile } from '../api/organization-profile';
import { PageHeader } from '../components/PageHeader';
import { OrganizationLogoSection } from '../organization-profile/OrganizationLogoSection';

type LoadState = 'loading' | 'loaded' | 'error';

// EN-127: the logo's own page. The profile page only shows the logo and
// links here; uploading and removing happen in OrganizationLogoSection,
// unchanged, which needs to know whether a logo exists when it mounts. The
// page stays put after an upload or a removal, so the section's status
// region and focus handling work as before.
export function OrganizationLogoPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasLogo, setHasLogo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getOrganizationProfile()
      .then((profile) => {
        if (!cancelled) {
          setHasLogo(profile.hasLogo);
          setLoadState('loaded');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <PageHeader title={t('organizationProfile.logoPageTitle')}>
        <Link to="/organization-profile" className="sf-btn" data-testid="organization-logo-back">
          {t('organizationProfile.backToProfileLabel')}
        </Link>
      </PageHeader>
      {loadState === 'loading' && (
        <p className="sf-empty" data-testid="organization-logo-page-loading">
          {t('organizationProfile.loading')}
        </p>
      )}
      {loadState === 'error' && (
        <p className="sf-empty" data-testid="organization-logo-page-error">
          {t('organizationProfile.errorState')}
        </p>
      )}
      {loadState === 'loaded' && <OrganizationLogoSection hasLogo={hasLogo} />}
    </main>
  );
}
