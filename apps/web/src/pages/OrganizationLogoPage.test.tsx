import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as organizationProfileApi from '../api/organization-profile';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { useAuth } from '../auth/AuthProvider';
import { OrganizationLogoPage } from './OrganizationLogoPage';

vi.mock('../api/organization-profile');
vi.mock('../auth/AuthProvider', async () => {
  const actual =
    await vi.importActual<typeof import('../auth/AuthProvider')>('../auth/AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedGetOrganizationProfile = vi.mocked(organizationProfileApi.getOrganizationProfile);
const mockedUpdateOrganizationProfile = vi.mocked(organizationProfileApi.updateOrganizationProfile);
const mockedUseAuth = vi.mocked(useAuth);

const profile = {
  id: 'profile-1',
  name: 'Acme Property Management',
  legalName: 'Acme Property Management S.L.',
  taxId: 'B12345678',
  address: '123 Main St',
  phone: '+34600000000',
  email: 'admin@acme.example',
  hasLogo: false,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organization-profile/logo']}>
      <Routes>
        <Route path="/organization-profile/logo" element={<OrganizationLogoPage />} />
        <Route
          path="/organization-profile"
          element={<div data-testid="profile-page-stub">profile page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function signInAs(role: 'SYSTEM_ADMIN' | 'MANAGER') {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', email: 'someone@sf-manager.example', role },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    sessionEnded: false,
    clearSessionEnded: vi.fn(),
  });
}

describe('OrganizationLogoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the logo section with the profile hasLogo flag under its own page title', async () => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...profile, hasLogo: true });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=0');

    renderPage();

    expect(await screen.findByTestId('organization-logo-preview')).toHaveAttribute(
      'src',
      '/logo?v=0',
    );
    expect(screen.getByTestId('organization-logo-input')).toBeInTheDocument();
    expect(screen.getByTestId('organization-logo-remove')).toBeInTheDocument();
    const title = screen.getByRole('heading', { level: 1, name: 'Organization logo' });
    expect(title.parentElement).toHaveClass('sf-page-header');
  });

  it('offers a button back to the organization profile', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(profile);

    renderPage();

    const back = await screen.findByRole('link', { name: 'Back to profile' });
    expect(back).toHaveAttribute('href', '/organization-profile');
    expect(back).toHaveClass('sf-btn');

    fireEvent.click(back);

    expect(await screen.findByTestId('profile-page-stub')).toBeInTheDocument();
  });

  it('confirms an upload in its status region and stays on the page, without saving the profile', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(profile);
    vi.mocked(organizationProfileApi.uploadOrganizationLogo).mockResolvedValue({
      ...profile,
      hasLogo: true,
    });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockImplementation(
      (version) => `/logo?v=${version}`,
    );
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      renderPage();

      fireEvent.change(await screen.findByTestId('organization-logo-input'), {
        target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
      });
      now.mockReturnValue(2000);
      fireEvent.click(screen.getByTestId('organization-logo-upload'));
      await screen.findByTestId('organization-logo-success');
    } finally {
      now.mockRestore();
    }

    const confirmation = await screen.findByTestId('organization-logo-success');
    expect(confirmation).toHaveTextContent('Logo uploaded.');
    expect(confirmation).not.toHaveAttribute('role');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toContainElement(confirmation);
    expect(screen.getByTestId('organization-logo-preview')).toHaveAttribute('src', '/logo?v=2000');
    expect(screen.queryByTestId('profile-page-stub')).not.toBeInTheDocument();
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
  });

  it('confirms a removal and moves focus to the logo heading, without saving the profile', async () => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...profile, hasLogo: true });
    vi.mocked(organizationProfileApi.removeOrganizationLogo).mockResolvedValue(profile);
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=0');
    renderPage();

    fireEvent.click(await screen.findByTestId('organization-logo-remove'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('organization-logo-success')).toHaveTextContent(
      'Logo removed.',
    );
    expect(screen.getByTestId('organization-logo-empty')).toHaveTextContent(
      'No logo uploaded yet.',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Logo' })).toHaveFocus();
    expect(screen.queryByTestId('organization-logo-remove')).not.toBeInTheDocument();
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
  });

  it('shows a loading state while the profile request is in flight', () => {
    mockedGetOrganizationProfile.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('organization-logo-page-loading')).toHaveClass('sf-empty');
    expect(screen.queryByTestId('organization-logo-input')).not.toBeInTheDocument();
  });

  it('shows a distinct error state when the profile cannot be loaded, with the way back', async () => {
    mockedGetOrganizationProfile.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('organization-logo-page-error')).toHaveClass('sf-empty');
    expect(screen.queryByTestId('organization-logo-page-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-logo-input')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to profile' })).toHaveAttribute(
      'href',
      '/organization-profile',
    );
  });
});

describe('OrganizationLogoPage route access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/organization-profile/logo']}>
        <Routes>
          <Route
            path="/organization-profile/logo"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <OrganizationLogoPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders the explicit NotAuthorized surface, not a redirect, for a non-admin role', () => {
    signInAs('MANAGER');

    renderRoute();

    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(mockedGetOrganizationProfile).not.toHaveBeenCalled();
  });

  it('renders the page for a SYSTEM_ADMIN', async () => {
    signInAs('SYSTEM_ADMIN');
    mockedGetOrganizationProfile.mockResolvedValue(profile);

    renderRoute();

    expect(await screen.findByTestId('organization-logo-input')).toBeInTheDocument();
  });
});
