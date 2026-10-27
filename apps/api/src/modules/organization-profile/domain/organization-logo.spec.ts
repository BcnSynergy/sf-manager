import {
  LOGO_MAX_BYTES,
  detectLogoFormat,
  logoContentTypeForKey,
} from './organization-logo';
import {
  jpegHeader,
  pngHeader,
  webpExtendedHeader,
  webpLosslessHeader,
  webpLossyHeader,
} from './testing/logo-fixtures';

const PNG = pngHeader();

describe('organization logo (organization-logo S2)', () => {
  it('allows at most 2 MiB', () => {
    expect(LOGO_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it.each([
    ['PNG', PNG, 'png', 'image/png'],
    ['JPEG', jpegHeader(), 'jpg', 'image/jpeg'],
    ['lossy WebP', webpLossyHeader(), 'webp', 'image/webp'],
    ['lossless WebP', webpLosslessHeader(), 'webp', 'image/webp'],
    ['extended WebP', webpExtendedHeader(), 'webp', 'image/webp'],
  ])(
    'detects %s from its signature and image header',
    (_name, content, extension, contentType) => {
      expect(detectLogoFormat(content)).toEqual({ extension, contentType });
    },
  );

  it('detects a JPEG whose size comes after other segments and fill bytes', () => {
    const jpeg = jpegHeader(640, 480);
    const withFill = Buffer.concat([
      jpeg.subarray(0, 20),
      Buffer.from([0xff]),
      jpeg.subarray(20),
    ]);

    expect(detectLogoFormat(withFill)?.extension).toBe('jpg');
  });

  // Browsers and libjpeg skip stray bytes between segments.
  it('detects a JPEG with stray bytes between segments', () => {
    const jpeg = jpegHeader();
    const withJunk = Buffer.concat([
      jpeg.subarray(0, 20),
      Buffer.from([0x00, 0x12]),
      jpeg.subarray(20),
    ]);

    expect(detectLogoFormat(withJunk)?.extension).toBe('jpg');
  });

  it('detects a JPEG with standalone markers before its size segment', () => {
    const jpeg = jpegHeader();
    const withMarkers = Buffer.concat([
      jpeg.subarray(0, 2),
      Buffer.from([0xff, 0x01, 0xff, 0xd0]),
      jpeg.subarray(2),
    ]);

    expect(detectLogoFormat(withMarkers)?.extension).toBe('jpg');
  });

  // DHT (C4), JPG (C8) and DAC (CC) sit in the start-of-frame range but
  // carry no image size, so they must not be read as one.
  it('detects a JPEG with a table segment before its size segment', () => {
    const jpeg = jpegHeader();
    const withTable = Buffer.concat([
      jpeg.subarray(0, 2),
      Buffer.from([0xff, 0xc4, 0x00, 0x05, 0x00, 0x00, 0x00]),
      jpeg.subarray(2),
    ]);

    expect(detectLogoFormat(withTable)?.extension).toBe('jpg');
  });

  it('detects a progressive JPEG (SOF2)', () => {
    const progressive = Buffer.from(jpegHeader());
    progressive[21] = 0xc2;

    expect(detectLogoFormat(progressive)?.extension).toBe('jpg');
  });

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
    // EN-111: a signature alone is not an image.
    ['the 3-byte JPEG signature alone', Buffer.from([0xff, 0xd8, 0xff])],
    ['the PNG signature alone', PNG.subarray(0, 8)],
    ['a PNG cut inside its header', PNG.subarray(0, 20)],
    [
      'a PNG whose first chunk is not IHDR',
      Buffer.from(PNG).fill('IDAT', 12, 16),
    ],
    ['a PNG of width 0', pngHeader(0, 1)],
    ['a PNG of height 0', pngHeader(1, 0)],
    [
      'a JPEG with no size segment before its image data',
      Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x00]),
    ],
    ['a JPEG of width 0', jpegHeader(0, 1)],
    ['a JPEG of height 0', jpegHeader(1, 0)],
    ['a JPEG cut inside its size segment', jpegHeader().subarray(0, 25)],
    [
      'a JPEG whose segment length runs past the end',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x7f, 0xff, 0x00]),
    ],
    [
      'a JPEG with only stray bytes after its start marker',
      Buffer.from([0xff, 0xd8, 0x00, 0xe0, 0x00, 0x02]),
    ],
    // Stray bytes are tolerated only between complete segments: the first
    // segment must follow the start marker right away.
    [
      'a JPEG with stray bytes right after its start marker',
      Buffer.concat([
        Buffer.from([0xff, 0xd8, 0x00]),
        jpegHeader().subarray(2),
      ]),
    ],
    [
      'a JPEG whose size segment is too short to hold a size',
      Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x06, 0x08, 0x00, 0x01, 0x00, 0x01,
      ]),
    ],
    ['a lossy WebP cut short', webpLossyHeader().subarray(0, 29)],
    ['a WebP header with no image chunk', webpLossyHeader().subarray(0, 12)],
    [
      'a WebP with an unknown first chunk',
      Buffer.from(webpLossyHeader()).fill('ABCD', 12, 16),
    ],
    [
      'a lossy WebP without its start code',
      Buffer.from(webpLossyHeader()).fill(0, 23, 26),
    ],
    ['a lossy WebP of width 0', webpLossyHeader(0, 1)],
    ['a lossy WebP of height 0', webpLossyHeader(1, 0)],
    [
      'a lossless WebP without its signature',
      Buffer.from(webpLosslessHeader()).fill(0, 20, 21),
    ],
    ['a lossless WebP cut short', webpLosslessHeader().subarray(0, 22)],
    ['an extended WebP cut short', webpExtendedHeader().subarray(0, 26)],
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
