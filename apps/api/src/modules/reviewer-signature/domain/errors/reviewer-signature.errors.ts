import { SIGNATURE_MAX_BYTES } from '../reviewer-signature';

export class UnsupportedSignatureFormatError extends Error {
  constructor() {
    super('The signature must be a PNG, JPEG or WebP image.');
    this.name = 'UnsupportedSignatureFormatError';
  }
}

export class SignatureTooLargeError extends Error {
  constructor() {
    super(`The signature must be at most ${SIGNATURE_MAX_BYTES} bytes.`);
    this.name = 'SignatureTooLargeError';
  }
}
