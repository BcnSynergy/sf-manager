import type { SignatureFormatInfo } from '../../domain/reviewer-signature';

// Port (application layer). reviewer-signature: the read of a user's own
// current signature that another module may use (review-session, to copy it
// onto a session when it is signed), bound in reviewer-signature.module.ts
// via `useExisting: ReadOwnSignatureImageUseCase` and exported without the
// repository, the storage key or the upload.
export interface OwnSignatureImage {
  content: Buffer;
  contentType: SignatureFormatInfo['contentType'];
  extension: SignatureFormatInfo['extension'];
}

export interface OwnSignatureReader {
  // Resolves null when the user has no signature to show: none recorded, or
  // a recorded key whose file is gone.
  execute(userId: string): Promise<OwnSignatureImage | null>;
}

export const OWN_SIGNATURE_READER = Symbol('OWN_SIGNATURE_READER');
