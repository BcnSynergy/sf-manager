// organization-logo S2: the logo is a PNG, JPEG or WebP image of at most
// 2 MiB. The format is decided by the file's content, never by its name or
// the declared content type. SVG is deliberately not accepted: it can carry
// scripts, and serving it safely needs sanitizing (see the register entry
// that defers it).
//
// EN-111: a signature alone is not enough. The content must also carry the
// format's image header with a width and height above zero: PNG's IHDR
// chunk, a JPEG start-of-frame segment, or WebP's VP8, VP8L or VP8X chunk.
// The pixel data itself is not decoded.
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export interface LogoFormat {
  extension: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
}

const PNG: LogoFormat = { extension: 'png', contentType: 'image/png' };
const JPEG: LogoFormat = { extension: 'jpg', contentType: 'image/jpeg' };
const WEBP: LogoFormat = { extension: 'webp', contentType: 'image/webp' };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SOI = [0xff, 0xd8];
const VP8_START_CODE = [0x9d, 0x01, 0x2a];
const VP8L_SIGNATURE = 0x2f;

function startsWith(content: Uint8Array, signature: number[], offset = 0) {
  return (
    content.length >= offset + signature.length &&
    signature.every((byte, index) => content[offset + index] === byte)
  );
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function uint16BE(content: Uint8Array, offset: number): number {
  return (content[offset] << 8) | content[offset + 1];
}

function uint32BE(content: Uint8Array, offset: number): number {
  return (
    ((content[offset] << 24) >>> 0) +
    ((content[offset + 1] << 16) |
      (content[offset + 2] << 8) |
      content[offset + 3])
  );
}

function uint16LE(content: Uint8Array, offset: number): number {
  return content[offset] | (content[offset + 1] << 8);
}

// Signature, then the IHDR chunk: length 13, type, width, height (BE).
function isPng(content: Uint8Array): boolean {
  return (
    startsWith(content, PNG_SIGNATURE) &&
    content.length >= 24 &&
    uint32BE(content, 8) === 13 &&
    startsWith(content, ascii('IHDR'), 12) &&
    uint32BE(content, 16) > 0 &&
    uint32BE(content, 20) > 0
  );
}

// Start-of-frame markers carry the image size; DHT (C4), JPG (C8) and DAC
// (CC) share the range but do not.
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

// SOI, then marker segments until a start-of-frame segment with a height
// and width above zero. Image data (SOS) or the end (EOI) before it, a
// segment not introduced by FF, or a length running past the end rejects.
function isJpeg(content: Uint8Array): boolean {
  if (!startsWith(content, JPEG_SOI)) return false;
  let offset = 2;
  while (offset < content.length) {
    if (content[offset] !== 0xff) return false;
    while (offset < content.length && content[offset] === 0xff) offset++;
    if (offset >= content.length) return false;
    const marker = content[offset];
    offset++;
    // Standalone markers have no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda || marker === 0xd9) return false;
    if (offset + 2 > content.length) return false;
    const length = uint16BE(content, offset);
    if (length < 2 || offset + length > content.length) return false;
    if (isStartOfFrame(marker)) {
      return (
        length >= 7 &&
        uint16BE(content, offset + 3) > 0 &&
        uint16BE(content, offset + 5) > 0
      );
    }
    offset += length;
  }
  return false;
}

// "RIFF", a size, "WEBP", then the first chunk at offset 12; its data
// starts at offset 20.
function isWebp(content: Uint8Array): boolean {
  if (
    !startsWith(content, ascii('RIFF')) ||
    !startsWith(content, ascii('WEBP'), 8)
  ) {
    return false;
  }
  if (startsWith(content, ascii('VP8 '), 12)) {
    return (
      content.length >= 30 &&
      startsWith(content, VP8_START_CODE, 23) &&
      (uint16LE(content, 26) & 0x3fff) > 0 &&
      (uint16LE(content, 28) & 0x3fff) > 0
    );
  }
  if (startsWith(content, ascii('VP8L'), 12)) {
    return content.length >= 25 && content[20] === VP8L_SIGNATURE;
  }
  if (startsWith(content, ascii('VP8X'), 12)) {
    return content.length >= 30;
  }
  return false;
}

export function detectLogoFormat(content: Uint8Array): LogoFormat | null {
  if (isPng(content)) return PNG;
  if (isJpeg(content)) return JPEG;
  if (isWebp(content)) return WEBP;
  return null;
}

// The stored key ends with the format's extension (`logos/<id>.png`), so the
// read can answer with the right content type without sniffing again.
export function logoContentTypeForKey(
  key: string,
): LogoFormat['contentType'] | null {
  const dot = key.lastIndexOf('.');
  if (dot === -1) return null;
  const extension = key.slice(dot + 1);
  return (
    [PNG, JPEG, WEBP].find((format) => format.extension === extension)
      ?.contentType ?? null
  );
}
