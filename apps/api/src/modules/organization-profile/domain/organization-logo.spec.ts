import {
  LOGO_MAX_BYTES,
  detectLogoFormat,
  logoContentTypeForKey,
} from './organization-logo';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
]);

describe('organization logo (organization-logo S2)', () => {
  it('allows at most 2 MiB', () => {
    expect(LOGO_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it.each([
    ['PNG', PNG, 'png', 'image/png'],
    ['JPEG', JPEG, 'jpg', 'image/jpeg'],
    ['WebP', WEBP, 'webp', 'image/webp'],
  ])(
    'detects %s from its leading bytes',
    (_name, content, extension, contentType) => {
      expect(detectLogoFormat(content)).toEqual({ extension, contentType });
    },
  );

  it.each([
    [
      'an SVG document',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ],
    ['a GIF', Buffer.from('GIF89a\x01\x00')],
    [
      'a RIFF file that is not WebP',
      Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt '),
    ],
    ['a truncated PNG signature', PNG.subarray(0, 4)],
    ['an empty file', Buffer.alloc(0)],
  ])('rejects %s', (_name, content) => {
    expect(detectLogoFormat(content)).toBeNull();
  });

  it.each([
    ['logos/0192.png', 'image/png'],
    ['logos/0192.jpg', 'image/jpeg'],
    ['logos/0192.webp', 'image/webp'],
  ])('derives the content type of %s from its key', (key, contentType) => {
    expect(logoContentTypeForKey(key)).toBe(contentType);
  });

  it('derives no content type from a key with an unknown extension', () => {
    expect(logoContentTypeForKey('logos/0192.svg')).toBeNull();
  });

  it('derives no content type from a key without an extension', () => {
    expect(logoContentTypeForKey('png')).toBeNull();
  });
});
