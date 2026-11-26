import { detectLogoFormat } from '../../organization-profile/domain/organization-logo';

// reviewer-signature, "Upload the Own Signature": a PNG, JPEG or WebP image
// of at most 2 MiB, recognised by content exactly as the organization logo
// is (EN-111 header checks). SVG, which the logo accepts, is not a
// signature format: nothing needs it, and it can carry scripts.
export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

// The FileStorage directory every own-signature file lives in.
export const SIGNATURE_DIRECTORY = 'signatures';

export interface SignatureFormatInfo {
  extension: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
}

const FORMATS: SignatureFormatInfo[] = [
  { extension: 'png', contentType: 'image/png' },
  { extension: 'jpg', contentType: 'image/jpeg' },
  { extension: 'webp', contentType: 'image/webp' },
];

export function detectSignatureFormat(
  content: Uint8Array,
): SignatureFormatInfo | null {
  const extension = detectLogoFormat(content)?.extension;
  return FORMATS.find((format) => format.extension === extension) ?? null;
}

// The stored key ends with the format's extension (`signatures/<id>.png`), so
// a read answers with the right content type without sniffing again.
export function signatureContentTypeForKey(
  key: string,
): SignatureFormatInfo['contentType'] | null {
  const dot = key.lastIndexOf('.');
  if (dot === -1) return null;
  const extension = key.slice(dot + 1);
  return (
    FORMATS.find((format) => format.extension === extension)?.contentType ??
    null
  );
}

// One registered signature per user. `storageKey` never leaves the API.
export interface ReviewerSignature {
  userId: string;
  storageKey: string;
  updatedAt: Date;
}
