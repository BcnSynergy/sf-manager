import QRCode from 'qrcode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsqrReader } from './qr-reader-jsqr';

const QUIET_ZONE = 4;
const PIXELS_PER_MODULE = 4;

// A real QR code for `text`, rasterized to RGBA pixels as a camera frame
// drawn on a canvas would give them.
function qrFrame(text: string): { data: Uint8ClampedArray; side: number } {
  const { modules } = QRCode.create(text);
  const side = (modules.size + QUIET_ZONE * 2) * PIXELS_PER_MODULE;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) {
        continue;
      }
      for (let dy = 0; dy < PIXELS_PER_MODULE; dy++) {
        for (let dx = 0; dx < PIXELS_PER_MODULE; dx++) {
          const x = (col + QUIET_ZONE) * PIXELS_PER_MODULE + dx;
          const y = (row + QUIET_ZONE) * PIXELS_PER_MODULE + dy;
          const index = (y * side + x) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
        }
      }
    }
  }
  return { data, side };
}

function videoOf(width: number, height: number): HTMLVideoElement {
  return { videoWidth: width, videoHeight: height } as HTMLVideoElement;
}

describe('createJsqrReader (EN-163)', () => {
  let frame: { data: Uint8ClampedArray; width: number; height: number };
  const drawImage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    frame = { data: new Uint8ClampedArray(4).fill(255), width: 1, height: 1 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      getImageData: () => frame,
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the text of a QR code in the frame', async () => {
    const { data, side } = qrFrame('AB12CD34EF');
    frame = { data, width: side, height: side };
    const video = videoOf(side, side);

    const reader = createJsqrReader();

    expect(await reader.read(video)).toBe('AB12CD34EF');
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, side, side);
  });

  it('returns null for a frame without a QR code', async () => {
    const side = 120;
    frame = { data: new Uint8ClampedArray(side * side * 4).fill(255), width: side, height: side };

    expect(await createJsqrReader().read(videoOf(side, side))).toBeNull();
  });

  it('returns null before the video has a frame', async () => {
    expect(await createJsqrReader().read(videoOf(0, 0))).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('scales a large frame down to 640 pixels on its longer side', async () => {
    const video = videoOf(1280, 960);

    await createJsqrReader().read(video);

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });
});
