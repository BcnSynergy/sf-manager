import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../api/client';
import * as organizationProfileApi from '../api/organization-profile';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { useAuth } from '../auth/AuthProvider';
import { OrganizationProfilePage } from './OrganizationProfilePage';

vi.mock('../api/organization-profile');
vi.mock('../auth/AuthProvider', async () => {
  const actual = await vi.importActual<typeof import('../auth/AuthProvider')>(
    '../auth/AuthProvider',
  );
  return { ...actual, useAuth: vi.fn() };
});

const mockedGetOrganizationProfile = vi.mocked(organizationProfileApi.getOrganizationProfile);
const mockedUpdateOrganizationProfile = vi.mocked(
  organizationProfileApi.updateOrganizationProfile,
);
const mockedUseAuth = vi.mocked(useAuth);

const blankProfile = {
  id: 'profile-1',
  name: '',
  legalName: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
};

const filledProfile = {
  id: 'profile-1',
  name: 'Acme Property Management',
  legalName: 'Acme Property Management S.L.',
  taxId: 'B12345678',
  address: '123 Main St',
  phone: '+34600000000',
  email: 'admin@acme.example',
};

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
    expect(screen.getByTestId('organization-profile-name')).toHaveValue(
      'Acme Property Management',
    );
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
    });
    mockedGetOrganizationProfile.mockResolvedValue(blankProfile);

    renderRoute();

    expect(await screen.findByTestId('organization-profile-incomplete')).toBeInTheDocument();
  });
});
