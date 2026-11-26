import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as signatureApi from '../api/reviewer-signature';
import { MySignaturePage } from './MySignaturePage';

vi.mock('../api/reviewer-signature');

const mockedStatus = vi.mocked(signatureApi.getOwnSignature);
const mockedUpload = vi.mocked(signatureApi.uploadOwnSignature);
const mockedImageUrl = vi.mocked(signatureApi.ownSignatureImageUrl);

const WITH_SIGNATURE = { hasSignature: true, updatedAt: '2026-11-26T10:00:00.000Z' } as const;
const WITHOUT_SIGNATURE = { hasSignature: false, updatedAt: null } as const;

function signatureFile(size = 10, type = 'image/png', name = 'signature.png'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MySignaturePage />
    </MemoryRouter>,
  );
}

async function upload(file: File) {
  fireEvent.change(await screen.findByTestId('my-signature-input'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByTestId('my-signature-upload'));
}

describe('MySignaturePage (reviewer-signature-ui)', () => {
  let now: MockInstance<() => number>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedImageUrl.mockImplementation((version: number) => `/signature?v=${version}`);
    now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    void i18n.changeLanguage('en');
  });

  afterEach(() => {
    now.mockRestore();
  });

  it('says no signature is registered and that reviews cannot be signed without one', async () => {
    mockedStatus.mockResolvedValue(WITHOUT_SIGNATURE);
    renderPage();

    expect(await screen.findByTestId('my-signature-empty')).toHaveTextContent(
      'You have no signature registered yet. You cannot sign a review until you upload one.',
    );
    expect(screen.queryByTestId('my-signature-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('my-signature-input')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    );
  });

  it('shows the current signature from the image endpoint', async () => {
    mockedStatus.mockResolvedValue(WITH_SIGNATURE);
    renderPage();

    const preview = await screen.findByTestId('my-signature-preview');
    expect(preview).toHaveAttribute('src', '/signature?v=1000');
    expect(preview).toHaveAttribute('alt', 'Your signature');
  });

  it('shows an error when the status cannot be loaded', async () => {
    mockedStatus.mockRejectedValue(new Error('network'));
    renderPage();

    expect(await screen.findByTestId('my-signature-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('my-signature-input')).not.toBeInTheDocument();
  });

  it('uploads the chosen file, shows the new image and confirms it', async () => {
    mockedStatus.mockResolvedValue(WITHOUT_SIGNATURE);
    mockedUpload.mockResolvedValue(WITH_SIGNATURE);
    now.mockReturnValue(2000);
    renderPage();
    const file = signatureFile();

    await upload(file);

    expect(mockedUpload).toHaveBeenCalledWith(file);
    expect(await screen.findByTestId('my-signature-success')).toHaveTextContent('Signature saved.');
    expect(screen.getByTestId('my-signature-preview')).toHaveAttribute('src', '/signature?v=2001');
    expect(screen.queryByTestId('my-signature-empty')).not.toBeInTheDocument();
  });

  it('keeps the current signature and names the cause when the API rejects the format', async () => {
    mockedStatus.mockResolvedValue(WITH_SIGNATURE);
    mockedUpload.mockRejectedValue(new ApiError(400, 'SIGNATURE_UNSUPPORTED_FORMAT'));
    renderPage();

    await upload(signatureFile());

    expect(await screen.findByTestId('my-signature-error')).toHaveTextContent(
      'The signature must be a PNG, JPEG or WebP image.',
    );
    expect(screen.getByTestId('my-signature-preview')).toHaveAttribute('src', '/signature?v=1000');
  });

  it('names an oversize file without sending it', async () => {
    mockedStatus.mockResolvedValue(WITHOUT_SIGNATURE);
    renderPage();

    await upload(signatureFile(2 * 1024 * 1024 + 1));

    expect(await screen.findByTestId('my-signature-error')).toHaveTextContent(
      'The signature must be at most 2 MB.',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('names a file of another type without sending it', async () => {
    mockedStatus.mockResolvedValue(WITHOUT_SIGNATURE);
    renderPage();

    await upload(signatureFile(10, 'image/svg+xml', 'signature.svg'));

    expect(await screen.findByTestId('my-signature-error')).toHaveTextContent(
      'The signature must be a PNG, JPEG or WebP image.',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('names any other failure generically', async () => {
    mockedStatus.mockResolvedValue(WITHOUT_SIGNATURE);
    mockedUpload.mockRejectedValue(new ApiError(500));
    renderPage();

    await upload(signatureFile());

    expect(await screen.findByTestId('my-signature-error')).toHaveTextContent(
      'Could not save the signature. Please try again.',
    );
  });

  it('falls back to a message when the image fails to load', async () => {
    mockedStatus.mockResolvedValue(WITH_SIGNATURE);
    renderPage();

    fireEvent.error(await screen.findByTestId('my-signature-preview'));

    await waitFor(() =>
      expect(screen.getByTestId('my-signature-empty')).toHaveTextContent(
        'Your signature could not be shown.',
      ),
    );
  });

  it.each(['es', 'ca'])('has every string in %s', async (lng) => {
    mockedStatus.mockResolvedValue(WITHOUT_SIGNATURE);
    await i18n.changeLanguage(lng);
    renderPage();

    await screen.findByTestId('my-signature-empty');
    for (const key of [
      'mySignature.title',
      'mySignature.loading',
      'mySignature.errorState',
      'mySignature.none',
      'mySignature.alt',
      'mySignature.loadError',
      'mySignature.fileLabel',
      'mySignature.uploadLabel',
      'mySignature.uploadSuccess',
      'mySignature.uploadError',
      'mySignature.tooLargeError',
      'mySignature.unsupportedError',
      'nav.mySignature',
      'home.description.mySignature',
    ]) {
      expect(i18n.exists(key, { lng }), `${lng} ${key}`).toBe(true);
    }
  });
});
