import { LOGO_MAX_BYTES } from '../organization-logo';

export class UnsupportedLogoFormatError extends Error {
  constructor() {
    super('The logo must be a PNG, JPEG, WebP or SVG image.');
    this.name = 'UnsupportedLogoFormatError';
  }
}

export class LogoTooLargeError extends Error {
  constructor() {
    super(`The logo must be at most ${LOGO_MAX_BYTES} bytes.`);
    this.name = 'LogoTooLargeError';
  }
}
