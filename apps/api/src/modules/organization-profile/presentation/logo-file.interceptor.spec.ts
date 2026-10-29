import { BadRequestException } from '@nestjs/common';
import { toLogoUploadSetupError } from './logo-file.interceptor';

describe('toLogoUploadSetupError (TD-44)', () => {
  it.each([
    'Unsupported content type: multipart/mixed; boundary=x',
    'Malformed content type',
  ])('turns the busboy error "%s" into a 400', (message) => {
    const translated = toLogoUploadSetupError(new Error(message));

    expect(translated).toBeInstanceOf(BadRequestException);
    expect((translated as BadRequestException).message).toBe(message);
  });

  it('passes any other error through unchanged, so server errors stay 500', () => {
    const error = new Error('Storage unavailable');

    expect(toLogoUploadSetupError(error)).toBe(error);
  });

  it('passes an existing HTTP exception through unchanged', () => {
    const error = new BadRequestException('Unexpected field');

    expect(toLogoUploadSetupError(error)).toBe(error);
  });
});
