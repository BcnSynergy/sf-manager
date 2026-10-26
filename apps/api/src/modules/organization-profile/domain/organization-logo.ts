// organization-logo S2: the logo is a PNG, JPEG or WebP image of at most
// 2 MiB. The format is decided by the file's leading bytes, never by its
// name or the declared content type. SVG is deliberately not accepted: it
// can carry scripts, and serving it safely needs sanitizing (see the
// register entry that defers it).
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export interface LogoFormat {
  extension: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
}

const PNG: LogoFormat = { extension: 'png', contentType: 'image/png' };
const JPEG: LogoFormat = { extension: 'jpg', contentType: 'image/jpeg' };
const WEBP: LogoFormat = { extension: 'webp', contentType: 'image/webp' };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(content: Uint8Array, signature: number[], offset = 0) {
  return (
    content.length >= offset + signature.length &&
    signature.every((byte, index) => content[offset + index] === byte)
  );
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

export function detectLogoFormat(content: Uint8Array): LogoFormat | null {
  if (startsWith(content, PNG_SIGNATURE)) return PNG;
  if (startsWith(content, JPEG_SIGNATURE)) return JPEG;
  // WebP: "RIFF", a 4-byte little-endian size, then "WEBP".
  if (
    startsWith(content, ascii('RIFF')) &&
    startsWith(content, ascii('WEBP'), 8)
  ) {
    return WEBP;
  }
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
