// Machine-readable discriminator of the /me/signature errors
// (reviewer-signature), added to the shared {statusCode, error, message}
// body by buildCodedError. The web client mirrors it as a literal union.
export type ReviewerSignatureErrorCode =
  | 'SIGNATURE_FILE_MISSING'
  | 'SIGNATURE_UNSUPPORTED_FORMAT'
  | 'SIGNATURE_UPLOAD_INVALID'
  | 'SIGNATURE_TOO_LARGE'
  | 'SIGNATURE_NOT_FOUND';
