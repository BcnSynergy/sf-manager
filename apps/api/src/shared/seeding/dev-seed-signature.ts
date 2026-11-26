import { crc32, deflateSync } from 'node:zlib';

// The signature image every dev-seed performer gets, so the seeded reviews
// can be signed and the document shows something to look at: a transparent
// 200x60 PNG with a dark-blue wave, drawn pixel by pixel (no asset file, no
// image dependency). Deterministic: the same bytes on every run.
const WIDTH = 200;
const HEIGHT = 60;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

export function buildDevSignaturePng(): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    // Each scanline starts with filter type 0 (none), then RGBA pixels.
    const row = Buffer.alloc(1 + WIDTH * 4);
    for (let x = 8; x < WIDTH - 8; x += 1) {
      const waveY = HEIGHT / 2 + Math.sin(x / 9) * (14 - (x / WIDTH) * 8);
      if (Math.abs(y - waveY) <= 1.2) {
        row.set([20, 40, 120, 255], 1 + x * 4);
      }
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
