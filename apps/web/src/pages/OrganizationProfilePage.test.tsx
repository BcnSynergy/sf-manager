import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as organizationProfileApi from '../api/organization-profile';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { useAuth } from '../auth/AuthProvider';
import { OrganizationProfilePage } from './OrganizationProfilePage';

vi.mock('../api/organization-profile');
vi.mock('../auth/AuthProvider', async () => {
  const actual =
    await vi.importActual<typeof import('../auth/AuthProvider')>('../auth/AuthProvider');
  return { ...actual, useAuth: vi.fn() };
});

const mockedGetOrganizationProfile = vi.mocked(organizationProfileApi.getOrganizationProfile);
const mockedUpdateOrganizationProfile = vi.mocked(organizationProfileApi.updateOrganizationProfile);
const mockedUseAuth = vi.mocked(useAuth);

const blankProfile = {
  id: 'profile-1',
  name: '',
  legalName: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  hasLogo: false,
};

const filledProfile = {
  id: 'profile-1',
  name: 'Acme Property Management',
  legalName: 'Acme Property Management S.L.',
  taxId: 'B12345678',
  address: '123 Main St',
  phone: '+34600000000',
  email: 'admin@acme.example',
  hasLogo: false,
};

// web-alert-announcements: one status region per covered form — the
// profile form's and the logo section's.
function statusRegions() {
  const logoSection = screen.getByRole('region', { name: 'Logo' });
  const all = screen.getAllByRole('status');
  expect(all).toHaveLength(2);
  return {
    profile: all.find((region) => !logoSection.contains(region))!,
    logo: all.find((region) => logoSection.contains(region))!,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organization-profile']}>
      <Routes>
        <Route path="/organization-profile" element={<OrganizationProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrganizationProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the logo section with the profile hasLogo flag (organization-logo S1)', async () => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...filledProfile, hasLogo: true });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=0');

    renderPage();

    expect(await screen.findByTestId('organization-logo-preview')).toHaveAttribute(
      'src',
      '/logo?v=0',
    );
    expect(screen.getByTestId('organization-logo-input')).toBeInTheDocument();
  });

  it('confirms a logo upload in the logo section status region, without saving the form (organization-logo S1)', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);
    vi.mocked(organizationProfileApi.uploadOrganizationLogo).mockResolvedValue({
      ...filledProfile,
      hasLogo: true,
    });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=1');
    renderPage();
    const name = await screen.findByTestId('organization-profile-name');
    fireEvent.change(name, { target: { value: 'Unsaved Name' } });
    const regions = statusRegions();
    expect(regions.logo).toBeEmptyDOMElement();

    fireEvent.change(screen.getByTestId('organization-logo-input'), {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    const confirmation = await screen.findByTestId('organization-logo-success');
    expect(confirmation).toHaveTextContent('Logo uploaded.');
    expect(confirmation).not.toHaveAttribute('role');
    expect(regions.logo).toContainElement(confirmation);
    expect(regions.profile).toBeEmptyDOMElement();
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
    expect(name).toHaveValue('Unsaved Name');
  });

  it('shows the no-logo message when the profile has no logo', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    expect(await screen.findByTestId('organization-logo-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-logo-preview')).not.toBeInTheDocument();
  });

  it('shows a loading state while the profile request is in flight', () => {
    mockedGetOrganizationProfile.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('organization-profile-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-incomplete')).not.toBeInTheDocument();
  });

  it('shows a distinct error state, not the loading or incomplete state, when the fetch fails', async () => {
    mockedGetOrganizationProfile.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('organization-profile-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-incomplete')).not.toBeInTheDocument();
  });

  it('shows the incomplete banner for the blank seeded profile', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);

    renderPage();

    expect(await screen.findByTestId('organization-profile-incomplete')).toBeInTheDocument();
    expect(screen.getByTestId('organization-profile-name')).toHaveValue('');
  });

  it('shows no incomplete banner once all six fields are filled', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    await screen.findByTestId('organization-profile-name');
    expect(screen.queryByTestId('organization-profile-incomplete')).not.toBeInTheDocument();
  });

  it('keeps the incomplete banner visible while typing — it only clears after a successful save', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockReturnValue(new Promise(() => {}));

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });

    expect(screen.getByTestId('organization-profile-incomplete')).toBeInTheDocument();
  });

  it('clears the incomplete banner after a successful save updates the saved snapshot', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: filledProfile.name },
    });
    fireEvent.change(screen.getByTestId('organization-profile-legal-name'), {
      target: { value: filledProfile.legalName },
    });
    fireEvent.change(screen.getByTestId('organization-profile-tax-id'), {
      target: { value: filledProfile.taxId },
    });
    fireEvent.change(screen.getByTestId('organization-profile-address'), {
      target: { value: filledProfile.address },
    });
    fireEvent.change(screen.getByTestId('organization-profile-phone'), {
      target: { value: filledProfile.phone },
    });
    fireEvent.change(screen.getByTestId('organization-profile-email'), {
      target: { value: filledProfile.email },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    await waitFor(() =>
      expect(screen.queryByTestId('organization-profile-incomplete')).not.toBeInTheDocument(),
    );
  });

  it('sends only the non-empty, trimmed fields on a partial fill of the blank seeded profile', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockResolvedValue({
      ...blankProfile,
      name: 'Acme Property Management',
      phone: '+34600000000',
    });

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: '  Acme Property Management  ' },
    });
    fireEvent.change(screen.getByTestId('organization-profile-phone'), {
      target: { value: '+34600000000' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    await waitFor(() =>
      expect(mockedUpdateOrganizationProfile).toHaveBeenCalledWith({
        name: 'Acme Property Management',
        phone: '+34600000000',
      }),
    );
  });

  it('rejects the submit locally, with no network call, when a previously-saved field is cleared', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    await screen.findByTestId('organization-profile-name');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    expect(await screen.findByTestId('organization-profile-error')).toBeInTheDocument();
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
  });

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the validation error again when the same invalid form is submitted again', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    fireEvent.change(await screen.findByTestId('organization-profile-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    const first = await screen.findByTestId('organization-profile-error');
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    const second = screen.getByTestId('organization-profile-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
  });

  it('keeps the entered values and shows an error when the save request fails', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockRejectedValue(new ApiError(400));

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    expect(await screen.findByTestId('organization-profile-error')).toBeInTheDocument();
    expect(screen.getByTestId('organization-profile-name')).toHaveValue('Acme Property Management');
    expect(screen.getByTestId('organization-profile-incomplete')).toBeInTheDocument();
  });

  it('disables every field input while a save is in flight, closing the race window for a conflicting edit', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    let resolveUpdate: (value: typeof filledProfile) => void = () => {};
    mockedUpdateOrganizationProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: filledProfile.name },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    // While the PATCH is in flight, the request already captured the typed
    // name — the input is disabled so there is no window to type a
    // DIFFERENT value that the eventual setValues(response) would then
    // silently discard.
    expect(screen.getByTestId('organization-profile-name')).toBeDisabled();
    expect(screen.getByTestId('organization-profile-legal-name')).toBeDisabled();

    resolveUpdate({ ...filledProfile, name: filledProfile.name });

    await waitFor(() => expect(screen.getByTestId('organization-profile-name')).toBeEnabled());
    expect(screen.getByTestId('organization-profile-name')).toHaveValue(filledProfile.name);
  });

  it('renders no navigation and stays on the page after a successful save (no navigate-on-save)', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockResolvedValue({
      ...blankProfile,
      name: 'Acme Property Management',
    });

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    await waitFor(() => expect(mockedUpdateOrganizationProfile).toHaveBeenCalled());
    expect(screen.getByTestId('organization-profile-name')).toBeInTheDocument();
  });

  // design.md Decision 5: "The page stays put and shows a success
  // indication." Remediation (sdd-verify WARNING, 2026-09-22) — this was
  // never implemented; on an already-complete profile a successful save
  // previously produced zero visible feedback.
  it('shows a success indication after a successful save, distinct from the incomplete and error banners', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockResolvedValue({
      ...blankProfile,
      name: 'Acme Property Management',
    });

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');
    expect(screen.queryByTestId('organization-profile-success')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    expect(await screen.findByTestId('organization-profile-success')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-error')).not.toBeInTheDocument();
  });

  // Fresh-context review (2026-09-22): a partial fill on a blank profile
  // saves successfully (`success` becomes true) while `saved` still has five
  // blank fields (`incomplete` stays true) — both banners are independently
  // derived (Decision 5) and legitimately coexist here; this is not a bug,
  // but it was previously an untested combined state.
  it('shows both the success indication and the incomplete banner together after a partial-fill save', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockResolvedValue({
      ...blankProfile,
      name: 'Acme Property Management',
    });

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    expect(await screen.findByTestId('organization-profile-success')).toBeInTheDocument();
    expect(screen.getByTestId('organization-profile-incomplete')).toBeInTheDocument();
  });

  it('clears the success indication once the admin edits a field again, so it cannot go stale', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockResolvedValue({
      ...blankProfile,
      name: 'Acme Property Management',
    });

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    await screen.findByTestId('organization-profile-success');

    fireEvent.change(screen.getByTestId('organization-profile-legal-name'), {
      target: { value: 'Acme Property Management S.L.' },
    });

    expect(screen.queryByTestId('organization-profile-success')).not.toBeInTheDocument();
  });

  it('does not show the success indication when the save request fails', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
    mockedUpdateOrganizationProfile.mockRejectedValue(new ApiError(400));

    renderPage();

    await screen.findByTestId('organization-profile-incomplete');

    fireEvent.change(screen.getByTestId('organization-profile-name'), {
      target: { value: 'Acme Property Management' },
    });
    fireEvent.click(screen.getByTestId('organization-profile-submit'));

    expect(await screen.findByTestId('organization-profile-error')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-success')).not.toBeInTheDocument();
  });
});

describe('OrganizationProfilePage route access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/organization-profile']}>
        <Routes>
          <Route
            path="/organization-profile"
            element={
              <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                <OrganizationProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders the explicit NotAuthorized surface, not a redirect, for a non-admin role', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'manager@sf-manager.example', role: 'MANAGER' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      sessionEnded: false,
      clearSessionEnded: vi.fn(),
    });

    renderRoute();

    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-profile-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(mockedGetOrganizationProfile).not.toHaveBeenCalled();
  });

  it('renders the page for a SYSTEM_ADMIN', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@sf-manager.example', role: 'SYSTEM_ADMIN' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      sessionEnded: false,
      clearSessionEnded: vi.fn(),
    });
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);

    renderRoute();

    expect(await screen.findByTestId('organization-profile-incomplete')).toBeInTheDocument();
  });

  describe('design system', () => {
    it('renders the loading and error states in empty-state boxes under a page header', async () => {
      mockedGetOrganizationProfile.mockReturnValue(new Promise(() => {}));
      const loading = renderPage();
      expect(screen.getByTestId('organization-profile-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      loading.unmount();

      mockedGetOrganizationProfile.mockRejectedValue(new ApiError(0));
      renderPage();
      expect(await screen.findByTestId('organization-profile-error-state')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders the form as field groups under a page header with the submit as the primary action', async () => {
      mockedGetOrganizationProfile.mockResolvedValue(filledProfile);
      renderPage();

      const submit = await screen.findByTestId('organization-profile-submit');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['name', 'legal-name', 'tax-id', 'address', 'phone', 'email']) {
        const control = screen.getByTestId(`organization-profile-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    it('shows the incomplete notice as an informational alert', async () => {
      mockedGetOrganizationProfile.mockResolvedValue(blankProfile);
      renderPage();

      const notice = await screen.findByTestId('organization-profile-incomplete');
      expect(notice).toHaveClass('sf-alert');
      expect(notice).not.toHaveClass('sf-alert-danger');
      expect(notice).not.toHaveClass('sf-alert-success');
      expect(notice).not.toHaveAttribute('role');
      expect(notice.querySelector('.sf-alert-icon')).toHaveTextContent('i');
    });

    it('shows the save confirmation as a success status alert', async () => {
      mockedGetOrganizationProfile.mockResolvedValue(filledProfile);
      mockedUpdateOrganizationProfile.mockResolvedValue(filledProfile);
      renderPage();

      fireEvent.click(await screen.findByTestId('organization-profile-submit'));

      const success = await screen.findByTestId('organization-profile-success');
      expect(success).toHaveClass('sf-alert', 'sf-alert-success');
    });

    // EN-76: a `role="status"` added already filled is not reliably
    // announced, so the confirmation appears inside a region that was there.
    it('shows the save confirmation inside a status region that was on the page before the save', async () => {
      mockedGetOrganizationProfile.mockResolvedValue(filledProfile);
      mockedUpdateOrganizationProfile.mockResolvedValue(filledProfile);
      renderPage();

      const submit = await screen.findByTestId('organization-profile-submit');
      const region = statusRegions().profile;
      expect(region).toBeEmptyDOMElement();

      fireEvent.click(submit);

      const success = await screen.findByTestId('organization-profile-success');
      expect(success).not.toHaveAttribute('role');
      expect(region).toContainElement(success);
      expect(statusRegions().profile).toBe(region);
    });

    it('shows the save failure as a danger alert', async () => {
      mockedGetOrganizationProfile.mockResolvedValue(filledProfile);
      mockedUpdateOrganizationProfile.mockRejectedValue(new ApiError(0));
      renderPage();

      fireEvent.click(await screen.findByTestId('organization-profile-submit'));

      const error = await screen.findByTestId('organization-profile-error');
      expect(mockedUpdateOrganizationProfile).toHaveBeenCalled();
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });
});
