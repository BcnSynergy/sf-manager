import { API_BASE_URL, apiFetch } from './client';

// Mirrors apps/api's OwnSignatureStatusDto (reviewer-signature). The storage
// key is never exposed; the image itself is read from ownSignatureImageUrl().
export type OwnSignatureStatus =
  { hasSignature: true; updatedAt: string } | { hasSignature: false; updatedAt: null };

// Mirrors apps/api's ReviewerSignatureErrorCode.
export type ReviewerSignatureErrorCode =
  | 'SIGNATURE_FILE_MISSING'
  | 'SIGNATURE_UNSUPPORTED_FORMAT'
  | 'SIGNATURE_UPLOAD_INVALID'
  | 'SIGNATURE_TOO_LARGE'
  | 'SIGNATURE_NOT_FOUND';

export function getOwnSignature(): Promise<OwnSignatureStatus> {
  return apiFetch<OwnSignatureStatus>('/me/signature');
}

// Multipart upload, field `file`. Resolves to the new status.
export function uploadOwnSignature(file: File): Promise<OwnSignatureStatus> {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<OwnSignatureStatus>('/me/signature', { method: 'PUT', body });
}

// An <img> source, not a fetch: the browser sends the session cookie itself.
// `version` changes the URL after an upload so the image is requested again.
export function ownSignatureImageUrl(version: number): string {
  return `${API_BASE_URL}/me/signature/image?v=${version}`;
}
