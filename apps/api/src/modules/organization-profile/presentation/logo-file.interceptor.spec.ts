import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { of } from 'rxjs';
import {
  LogoFileInterceptor,
  toLogoUploadSetupError,
} from './logo-file.interceptor';

describe('toLogoUploadSetupError (TD-44)', () => {
  it('turns busboy\'s "Unsupported content type" error into a 400', () => {
    const message = 'Unsupported content type: multipart/mixed; boundary=x';

    const translated = toLogoUploadSetupError(new Error(message));

    expect(translated).toBeInstanceOf(BadRequestException);
    expect((translated as BadRequestException).message).toBe(message);
  });

  // EN-115: the spec answers an unparseable content type with
  // LOGO_FILE_MISSING, so the defensive branch must too.
  it('turns busboy\'s "Malformed content type" error into LOGO_FILE_MISSING', () => {
    const translated = toLogoUploadSetupError(
      new Error('Malformed content type'),
    );

    expect(translated).toBeInstanceOf(HttpException);
    expect(translated).not.toBeInstanceOf(BadRequestException);
    expect((translated as HttpException).getStatus()).toBe(400);
    expect((translated as HttpException).getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'A logo file is required in the "file" field.',
      code: 'LOGO_FILE_MISSING',
    });
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

// EN-116: the override around multer's interceptor, with multer itself
// replaced by a stub of the base class's intercept.
describe('LogoFileInterceptor.intercept', () => {
  const base = Object.getPrototypeOf(LogoFileInterceptor.prototype) as {
    intercept: LogoFileInterceptor['intercept'];
  };
  const context = {} as ExecutionContext;
  const next: CallHandler = { handle: () => of('handled') };

  afterEach(() => jest.restoreAllMocks());

  it("returns multer's result when it accepts the request", async () => {
    const result = of('handled');
    const intercept = jest.spyOn(base, 'intercept').mockResolvedValue(result);

    await expect(
      new LogoFileInterceptor().intercept(context, next),
    ).resolves.toBe(result);
    expect(intercept).toHaveBeenCalledWith(context, next);
  });

  it("translates busboy's content-type error into a 400", async () => {
    const message = 'Unsupported content type: multipart/mixed; boundary=x';
    jest.spyOn(base, 'intercept').mockRejectedValue(new Error(message));

    const rejection = new LogoFileInterceptor().intercept(context, next);

    await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
    await expect(rejection).rejects.toThrow(message);
  });

  it('rethrows any other error unchanged', async () => {
    const error = new Error('Storage unavailable');
    jest.spyOn(base, 'intercept').mockRejectedValue(error);

    await expect(
      new LogoFileInterceptor().intercept(context, next),
    ).rejects.toBe(error);
  });
});
