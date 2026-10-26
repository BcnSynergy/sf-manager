import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as organizationProfileApi from '../api/organization-profile';
import { OrganizationLogoSection } from './OrganizationLogoSection';

vi.mock('../api/organization-profile');

const mockedUpload = vi.mocked(organizationProfileApi.uploadOrganizationLogo);
const mockedLogoUrl = vi.mocked(organizationProfileApi.organizationLogoUrl);

const profile = {
  id: 'profile-1',
  name: 'Acme',
  legalName: 'Acme S.L.',
  taxId: 'B1',
  address: 'Main St',
  phone: '600',
  email: 'a@acme.example',
  hasLogo: true,
};

function pngFile(size = 10, type = 'image/png', name = 'logo.png'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByTestId('organization-logo-input'), {
    target: { files: [file] },
  });
}

describe('OrganizationLogoSection (organization-logo S1, S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLogoUrl.mockImplementation((version: number) => `/logo?v=${version}`);
    void i18n.changeLanguage('en');
  });

  it('says there is no logo yet, and shows no image, when the profile has none', () => {
    render(<OrganizationLogoSection hasLogo={false} />);

    expect(screen.getByTestId('organization-logo-empty')).toHaveTextContent(
      'No logo uploaded yet.',
    );
    expect(screen.queryByTestId('organization-logo-preview')).not.toBeInTheDocument();
  });

  it('previews the current logo from the logo endpoint', () => {
    render(<OrganizationLogoSection hasLogo />);

    const preview = screen.getByTestId('organization-logo-preview');
    expect(preview).toHaveAttribute('src', '/logo?v=0');
    expect(preview).toHaveAttribute('alt', 'Organization logo');
  });

  it('falls back to a message when the logo image fails to load', () => {
    render(<OrganizationLogoSection hasLogo />);

    fireEvent.error(screen.getByTestId('organization-logo-preview'));

    expect(screen.queryByTestId('organization-logo-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-logo-empty')).toHaveTextContent(
      'The logo could not be loaded.',
    );
  });

  it('only accepts PNG, JPEG and WebP in the file picker', () => {
    render(<OrganizationLogoSection hasLogo={false} />);

    expect(screen.getByTestId('organization-logo-input')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    );
  });

  it('keeps the upload button disabled until a file is chosen', () => {
    render(<OrganizationLogoSection hasLogo={false} />);

    expect(screen.getByTestId('organization-logo-upload')).toBeDisabled();
    chooseFile(pngFile());
    expect(screen.getByTestId('organization-logo-upload')).toBeEnabled();
  });

  it('uploads the chosen file, confirms it and reloads the preview', async () => {
    mockedUpload.mockResolvedValue(profile);
    render(<OrganizationLogoSection hasLogo={false} />);
    const file = pngFile();

    chooseFile(file);
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(await screen.findByTestId('organization-logo-success')).toHaveTextContent(
      'Logo uploaded.',
    );
    expect(mockedUpload).toHaveBeenCalledWith(file);
    expect(screen.getByTestId('organization-logo-preview')).toHaveAttribute('src', '/logo?v=1');
    expect(screen.getByTestId('organization-logo-upload')).toBeDisabled();
  });

  it('rejects a file over 2 MB before any request', () => {
    render(<OrganizationLogoSection hasLogo={false} />);

    chooseFile(pngFile(2 * 1024 * 1024 + 1));
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(screen.getByTestId('organization-logo-error')).toHaveTextContent(
      'The logo must be 2 MB or smaller.',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 2 MB', async () => {
    mockedUpload.mockResolvedValue(profile);
    render(<OrganizationLogoSection hasLogo={false} />);

    chooseFile(pngFile(2 * 1024 * 1024));
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalled());
  });

  it.each([
    ['an SVG', 'image/svg+xml', 'logo.svg'],
    ['a GIF', 'image/gif', 'logo.gif'],
    ['a file of unknown type', '', 'logo'],
  ])('rejects %s before any request', (_name, type, name) => {
    render(<OrganizationLogoSection hasLogo={false} />);

    chooseFile(pngFile(10, type, name));
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(screen.getByTestId('organization-logo-error')).toHaveTextContent(
      'The logo must be a PNG, JPEG or WebP image.',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(400, 'LOGO_UNSUPPORTED_FORMAT'), 'The logo must be a PNG, JPEG or WebP image.'],
    [new ApiError(413), 'The logo must be 2 MB or smaller.'],
    [new ApiError(400, 'LOGO_FILE_MISSING'), 'Could not upload the logo. Please try again.'],
    [new ApiError(500), 'Could not upload the logo. Please try again.'],
    [new ApiError(0), 'Could not upload the logo. Please try again.'],
  ])(
    'maps a failed upload (%o) to its message and keeps the previous preview',
    async (error, message) => {
      mockedUpload.mockRejectedValue(error);
      render(<OrganizationLogoSection hasLogo />);

      chooseFile(pngFile());
      fireEvent.click(screen.getByTestId('organization-logo-upload'));

      expect(await screen.findByTestId('organization-logo-error')).toHaveTextContent(message);
      expect(screen.getByTestId('organization-logo-preview')).toHaveAttribute('src', '/logo?v=0');
    },
  );

  it('announces a repeated rejection again, as a new role="alert" element (web-alert-announcements)', () => {
    render(<OrganizationLogoSection hasLogo={false} />);
    chooseFile(pngFile(10, 'image/gif', 'logo.gif'));

    fireEvent.click(screen.getByTestId('organization-logo-upload'));
    const first = screen.getByRole('alert');
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(screen.getByRole('alert')).not.toBe(first);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The logo must be a PNG, JPEG or WebP image.',
    );
  });

  it('disables the picker and the button while the upload is in flight', () => {
    mockedUpload.mockReturnValue(new Promise(() => {}));
    render(<OrganizationLogoSection hasLogo={false} />);

    chooseFile(pngFile());
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(screen.getByTestId('organization-logo-input')).toBeDisabled();
    expect(screen.getByTestId('organization-logo-upload')).toBeDisabled();
  });

  it('clears a previous confirmation when another file is chosen', async () => {
    mockedUpload.mockResolvedValue(profile);
    render(<OrganizationLogoSection hasLogo={false} />);
    chooseFile(pngFile());
    fireEvent.click(screen.getByTestId('organization-logo-upload'));
    await screen.findByTestId('organization-logo-success');

    chooseFile(pngFile());

    expect(screen.queryByTestId('organization-logo-success')).not.toBeInTheDocument();
  });
});
