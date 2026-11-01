import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
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

// web-alert-announcements: the profile form's status region. The logo's
// upload and removal, with their own region, live on the logo page (EN-127).
function statusRegions() {
  const all = screen.getAllByRole('status');
  expect(all).toHaveLength(1);
  return { profile: all[0] };
}

// A data router, like the app's: the page's leave guard (EN-129) uses
// useBlocker, which throws under a declarative <MemoryRouter>.
function renderAt(routes: RouteObject[]) {
  const router = createMemoryRouter(routes, { initialEntries: ['/organization-profile'] });
  return { router, ...render(<RouterProvider router={router} />) };
}

function renderPage() {
  return renderAt([
    { path: '/organization-profile', element: <OrganizationProfilePage /> },
    {
      path: '/organization-profile/logo',
      element: <div data-testid="logo-page-stub">logo page</div>,
    },
  ]);
}

describe('OrganizationProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // EN-127: the profile only shows the logo; uploading and removing it
  // happen on the logo page.
  it('previews the current logo, with no upload or remove control', async () => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...filledProfile, hasLogo: true });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=0');

    renderPage();

    const preview = await screen.findByTestId('organization-profile-logo-preview');
    expect(preview).toHaveAttribute('src', '/logo?v=0');
    expect(preview).toHaveAttribute('alt', 'Organization logo');
    expect(screen.getByRole('region', { name: 'Logo' })).toContainElement(preview);
    expect(screen.queryByTestId('organization-profile-logo-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-logo-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-logo-upload')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-logo-remove')).not.toBeInTheDocument();
  });

  // EN-127 review: the logo is replaced on its own page and the SPA does not
  // reload, so a fixed URL could let the browser reuse the old image when the
  // admin comes back. Each mount asks for a URL of its own.
  it('requests the logo with a fresh version each time the page mounts', async () => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...filledProfile, hasLogo: true });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockImplementation(
      (version) => `/logo?v=${version}`,
    );
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const first = renderPage();
      expect(await screen.findByTestId('organization-profile-logo-preview')).toHaveAttribute(
        'src',
        '/logo?v=1000',
      );
      first.unmount();

      now.mockReturnValue(2000);
      renderPage();

      expect(await screen.findByTestId('organization-profile-logo-preview')).toHaveAttribute(
        'src',
        '/logo?v=2000',
      );
    } finally {
      now.mockRestore();
    }
  });

  it('says that no logo has been uploaded when the profile has none', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    expect(await screen.findByTestId('organization-profile-logo-empty')).toHaveTextContent(
      'No logo uploaded yet.',
    );
    expect(screen.queryByTestId('organization-profile-logo-preview')).not.toBeInTheDocument();
  });

  it('replaces a logo that cannot be loaded with a message', async () => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...filledProfile, hasLogo: true });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=0');

    renderPage();

    fireEvent.error(await screen.findByTestId('organization-profile-logo-preview'));

    expect(screen.getByTestId('organization-profile-logo-empty')).toHaveTextContent(
      'The logo could not be loaded.',
    );
    expect(screen.queryByTestId('organization-profile-logo-preview')).not.toBeInTheDocument();
  });

  // EN-127: a button-styled link, so it matches the page's other actions and
  // is a real, keyboard-reachable control, which an image alone is not.
  it.each([
    ['with a logo', true],
    ['without a logo', false],
  ])('offers a Change logo button that opens the logo page, %s', async (_label, hasLogo) => {
    mockedGetOrganizationProfile.mockResolvedValue({ ...filledProfile, hasLogo });
    vi.mocked(organizationProfileApi.organizationLogoUrl).mockReturnValue('/logo?v=0');

    renderPage();

    const change = await screen.findByRole('link', { name: 'Change logo' });
    expect(change).toHaveAttribute('href', '/organization-profile/logo');
    expect(change).toHaveClass('sf-btn');
    expect(screen.getByRole('region', { name: 'Logo' })).toContainElement(change);

    fireEvent.click(change);

    expect(await screen.findByTestId('logo-page-stub')).toBeInTheDocument();
  });

  // Placed above the data form, so the form's save button does not look as
  // if it also saved the logo.
  it('places the logo section above the profile form and its save button', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    const change = await screen.findByRole('link', { name: 'Change logo' });
    const firstField = screen.getByTestId('organization-profile-legal-name');
    expect(
      change.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // With the logo section first, the form needs its own heading; otherwise a
  // screen reader moving by headings hears the fields as part of the logo.
  it('gives the profile form its own heading, after the logo section', async () => {
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);

    renderPage();

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Organization details',
    });
    const change = screen.getByRole('link', { name: 'Change logo' });
    const firstField = screen.getByTestId('organization-profile-legal-name');
    expect(change.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      heading.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Organization details' })).toContainElement(firstField);
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
    return renderAt([
      {
        path: '/organization-profile',
        element: (
          <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
            <OrganizationProfilePage />
          </ProtectedRoute>
        ),
      },
      { path: '/login', element: <div data-testid="login-page">login</div> },
    ]);
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

// EN-129: leaving the page with unsaved edits asks first.
describe('OrganizationProfilePage leave guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetOrganizationProfile.mockResolvedValue(filledProfile);
  });

  async function editName(value: string) {
    fireEvent.change(await screen.findByTestId('organization-profile-name'), {
      target: { value },
    });
  }

  function leaveDialog() {
    return screen.getByTestId('confirm-dialog');
  }

  it('asks before leaving with unsaved edits, and cancelling keeps them', async () => {
    const { router } = renderPage();
    await editName('Edited name');

    fireEvent.click(screen.getByRole('link', { name: 'Change logo' }));

    expect(leaveDialog()).toHaveAttribute('open');
    expect(leaveDialog()).toHaveTextContent('Leave without saving?');
    expect(leaveDialog()).toHaveTextContent(
      'Your changes to the organization profile have not been saved and will be lost.',
    );
    expect(screen.queryByTestId('logo-page-stub')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(leaveDialog()).not.toHaveAttribute('open');
    expect(router.state.location.pathname).toBe('/organization-profile');
    expect(screen.getByTestId('organization-profile-name')).toHaveValue('Edited name');
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
  });

  it('leaves and drops the edits when the admin confirms', async () => {
    const { router } = renderPage();
    await editName('Edited name');

    fireEvent.click(screen.getByRole('link', { name: 'Change logo' }));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('logo-page-stub')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/organization-profile/logo');
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
  });

  it('asks on any in-app navigation, not only Change logo', async () => {
    const { router } = renderAt([
      { path: '/organization-profile', element: <OrganizationProfilePage /> },
      { path: '/users', element: <div data-testid="users-stub">users</div> },
    ]);
    await editName('Edited name');

    // What a nav-menu link does: navigate the router to another page.
    await act(() => router.navigate('/users'));

    expect(leaveDialog()).toHaveAttribute('open');
    expect(router.state.location.pathname).toBe('/organization-profile');
    expect(screen.queryByTestId('users-stub')).not.toBeInTheDocument();
  });

  it('asks on the browser back button too, and leaving completes the back step', async () => {
    const router = createMemoryRouter(
      [
        { path: '/users', element: <div data-testid="users-stub">users</div> },
        { path: '/organization-profile', element: <OrganizationProfilePage /> },
      ],
      { initialEntries: ['/users', '/organization-profile'], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await editName('Edited name');

    await act(() => router.navigate(-1));

    expect(leaveDialog()).toHaveAttribute('open');
    expect(router.state.location.pathname).toBe('/organization-profile');
    expect(screen.queryByTestId('users-stub')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByTestId('users-stub')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/users');
    expect(mockedUpdateOrganizationProfile).not.toHaveBeenCalled();
  });

  it('leaves without asking when nothing was edited', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('link', { name: 'Change logo' }));

    expect(await screen.findByTestId('logo-page-stub')).toBeInTheDocument();
  });

  it('leaves without asking when the edits were typed back to the saved values', async () => {
    renderPage();
    await editName('Edited name');
    await editName(filledProfile.name);

    fireEvent.click(screen.getByRole('link', { name: 'Change logo' }));

    expect(await screen.findByTestId('logo-page-stub')).toBeInTheDocument();
  });

  it('leaves without asking after the edits were saved', async () => {
    mockedUpdateOrganizationProfile.mockResolvedValue({ ...filledProfile, name: 'Edited name' });
    renderPage();
    await editName('Edited name');
    fireEvent.click(screen.getByTestId('organization-profile-submit'));
    await screen.findByTestId('organization-profile-success');
    // The save resolves outside act, and useBlocker swaps in the now-clean
    // check in an effect after the paint; flush it before clicking, as any
    // real click lands frames later.
    await act(async () => {});

    fireEvent.click(screen.getByRole('link', { name: 'Change logo' }));

    expect(await screen.findByTestId('logo-page-stub')).toBeInTheDocument();
  });
});
