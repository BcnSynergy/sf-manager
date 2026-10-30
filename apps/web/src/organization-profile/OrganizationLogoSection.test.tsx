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
const mockedRemove = vi.mocked(organizationProfileApi.removeOrganizationLogo);

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

  it('only accepts PNG, JPEG, WebP and SVG in the file picker (EN-109)', () => {
    render(<OrganizationLogoSection hasLogo={false} />);

    expect(screen.getByTestId('organization-logo-input')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp,image/svg+xml',
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

  it('uploads an SVG (EN-109)', async () => {
    mockedUpload.mockResolvedValue(profile);
    render(<OrganizationLogoSection hasLogo={false} />);
    const file = pngFile(10, 'image/svg+xml', 'logo.svg');

    chooseFile(file);
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith(file));
  });

  it.each([
    ['a GIF', 'image/gif', 'logo.gif'],
    ['a file of unknown type', '', 'logo'],
  ])('rejects %s before any request', (_name, type, name) => {
    render(<OrganizationLogoSection hasLogo={false} />);

    chooseFile(pngFile(10, type, name));
    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(screen.getByTestId('organization-logo-error')).toHaveTextContent(
      'The logo must be a PNG, JPEG, WebP or SVG image.',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it.each([
    [
      new ApiError(400, 'LOGO_UNSUPPORTED_FORMAT'),
      'The logo must be a PNG, JPEG, WebP or SVG image.',
    ],
    [new ApiError(413), 'The logo must be 2 MB or smaller.'],
    [new ApiError(400, 'LOGO_FILE_MISSING'), 'Could not upload the logo. Please try again.'],
    [new ApiError(400, 'LOGO_UPLOAD_INVALID'), 'Could not upload the logo. Please try again.'],
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
      'The logo must be a PNG, JPEG, WebP or SVG image.',
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

// EN-110: removing the logo, confirmed in a dialog.
describe('OrganizationLogoSection: removing the logo (EN-110)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLogoUrl.mockImplementation((version: number) => `/logo?v=${version}`);
    void i18n.changeLanguage('en');
  });

  it('offers no remove control when there is no logo', () => {
    render(<OrganizationLogoSection hasLogo={false} />);

    expect(screen.queryByTestId('organization-logo-remove')).not.toBeInTheDocument();
  });

  it('asks for confirmation, and cancelling keeps the logo without a request', () => {
    render(<OrganizationLogoSection hasLogo />);

    fireEvent.click(screen.getByTestId('organization-logo-remove'));
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveTextContent('Remove logo');
    expect(dialog).toHaveTextContent(
      'The logo will no longer appear on the profile or on review documents.',
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(mockedRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId('organization-logo-preview')).toBeInTheDocument();
  });

  it('removes the logo on confirmation and says so', async () => {
    mockedRemove.mockResolvedValue({
      id: 'profile-1',
      name: 'Acme',
      legalName: 'Acme S.L.',
      taxId: 'B1',
      address: 'Main St',
      phone: '600',
      email: 'a@acme.example',
      hasLogo: false,
    });
    render(<OrganizationLogoSection hasLogo />);

    fireEvent.click(screen.getByTestId('organization-logo-remove'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    const success = await screen.findByTestId('organization-logo-success');
    expect(success).toHaveTextContent('Logo removed.');
    expect(screen.getByRole('status')).toContainElement(success);
    expect(screen.getByRole('heading', { name: 'Logo' })).toHaveFocus();
    expect(mockedRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('organization-logo-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-logo-empty')).toHaveTextContent(
      'No logo uploaded yet.',
    );
    expect(screen.queryByTestId('organization-logo-remove')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the logo and shows an error when the removal fails', async () => {
    mockedRemove.mockRejectedValue(new ApiError(500, 'boom'));
    render(<OrganizationLogoSection hasLogo />);

    fireEvent.click(screen.getByTestId('organization-logo-remove'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not remove the logo. Please try again.',
    );
    expect(screen.getByTestId('organization-logo-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-logo-success')).not.toBeInTheDocument();
  });

  it('can remove a logo whose image failed to load', () => {
    render(<OrganizationLogoSection hasLogo />);

    fireEvent.error(screen.getByTestId('organization-logo-preview'));

    expect(screen.getByTestId('organization-logo-remove')).toBeEnabled();
  });

  it('disables upload and remove while a removal is in flight', () => {
    mockedRemove.mockReturnValue(new Promise(() => {}));
    render(<OrganizationLogoSection hasLogo />);
    chooseFile(pngFile());
    expect(screen.getByTestId('organization-logo-upload')).toBeEnabled();

    fireEvent.click(screen.getByTestId('organization-logo-remove'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(screen.getByTestId('organization-logo-remove')).toBeDisabled();
    expect(screen.getByTestId('organization-logo-upload')).toBeDisabled();
    expect(screen.getByTestId('organization-logo-input')).toBeDisabled();
  });

  it('disables remove while an upload is in flight', () => {
    mockedUpload.mockReturnValue(new Promise(() => {}));
    render(<OrganizationLogoSection hasLogo />);
    chooseFile(pngFile());

    fireEvent.click(screen.getByTestId('organization-logo-upload'));

    expect(screen.getByTestId('organization-logo-remove')).toBeDisabled();
  });

  it('gives focus back to the remove control when the removal fails', async () => {
    mockedRemove.mockRejectedValue(new ApiError(500));
    render(<OrganizationLogoSection hasLogo />);

    fireEvent.click(screen.getByTestId('organization-logo-remove'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByTestId('organization-logo-remove')).toHaveFocus());
  });
});
