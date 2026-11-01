import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { organizationLogoUrl } from '../api/organization-profile';

type Props = {
  // From the profile read: whether a logo exists.
  hasLogo: boolean;
};

// EN-127: on the profile page the logo is only shown; uploading and removing
// it happen on the logo page (OrganizationLogoSection). The way there is a
// button-styled link, like the page's other actions, because an image alone
// is neither an obvious nor an accessible control. As on the logo page, an
// image that fails to load gives way to a message instead of a broken image.
export function OrganizationLogoSummary({ hasLogo }: Props) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const showPreview = hasLogo && !imageFailed;

  return (
    <section className="sf-panel" aria-labelledby="organization-logo-summary-title">
      <h2 id="organization-logo-summary-title" className="sf-section-title">
        {t('organizationProfile.logoTitle')}
      </h2>
      {showPreview ? (
        <img
          className="sf-logo-preview"
          src={organizationLogoUrl(0)}
          alt={t('organizationProfile.logoAlt')}
          onError={() => setImageFailed(true)}
          data-testid="organization-profile-logo-preview"
        />
      ) : (
        <p className="sf-empty" data-testid="organization-profile-logo-empty">
          {t(imageFailed ? 'organizationProfile.logoLoadError' : 'organizationProfile.noLogo')}
        </p>
      )}
      <div className="sf-actions">
        <Link
          to="/organization-profile/logo"
          className="sf-btn"
          data-testid="organization-profile-change-logo"
        >
          {t('organizationProfile.changeLogoLabel')}
        </Link>
      </div>
    </section>
  );
}
