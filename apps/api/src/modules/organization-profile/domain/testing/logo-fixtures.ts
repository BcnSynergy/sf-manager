// EN-111: the smallest byte sequences detectLogoFormat accepts for each
// format — the signature plus a header carrying the image size. They are
// not complete images (no pixel data), so they serve the API's checks, not
// a browser. Each builder takes the size so tests can probe zero sizes.

export function pngHeader(width = 1, height = 1): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // IHDR data length
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 6; // colour type RGBA
  // compression, filter, interlace and the CRC stay 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
  ]);
}

// SOI, an APP0 segment, then a baseline SOF0 segment with the size.
export function jpegHeader(width = 1, height = 1): Buffer {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sof0 = Buffer.alloc(19);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(17, 2); // segment length
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3; // components
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
}

function riff(chunk: Buffer): Buffer {
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + chunk.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, chunk]);
}

function webpChunk(fourcc: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(fourcc, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}

// Lossy WebP: a key-frame tag, the start code 9D 01 2A, then 14-bit sizes.
export function webpLossyHeader(width = 1, height = 1): Buffer {
  const data = Buffer.alloc(10);
  data[3] = 0x9d;
  data[4] = 0x01;
  data[5] = 0x2a;
  data.writeUInt16LE(width, 6);
  data.writeUInt16LE(height, 8);
  return riff(webpChunk('VP8 ', data));
}

// Lossless WebP: the 0x2F signature, then width-1 and height-1 in 14 bits
// each, so its size is never zero.
export function webpLosslessHeader(): Buffer {
  const data = Buffer.alloc(5);
  data[0] = 0x2f;
  return riff(webpChunk('VP8L', data));
}

// Extended WebP: flags, then canvas width-1 and height-1 in 24 bits each.
export function webpExtendedHeader(): Buffer {
  return riff(webpChunk('VP8X', Buffer.alloc(10)));
}
